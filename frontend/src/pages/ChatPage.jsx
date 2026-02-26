import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { disconnectSocket, getSocket } from "../lib/socket";

const formatTime = (time) =>
  new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function ChatPage() {
  const navigate = useNavigate();
  const user = useMemo(() => JSON.parse(localStorage.getItem("user") || "{}"), []);
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedAddMemberId, setSelectedAddMemberId] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [alert, setAlert] = useState("");
  const [error, setError] = useState("");

  const messageEndRef = useRef(null);
  const socketRef = useRef(null);
  const activeRoomRef = useRef(null);
  const baseSocketUrl = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

  const sortRoomsByLatest = (nextRooms) =>
    [...nextRooms].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );

  const getRoomTitle = (room) => {
    if (!room) return "Select a room";
    if (!room.isPrivate) return room.name;
    const other = room.members?.find((m) => m._id !== user._id);
    return other ? `DM: ${other.name}` : room.name;
  };

  const getRoomSubtitle = (room) => {
    if (!room) return "";
    if (room.isPrivate) return "Private chat";
    const count = room.members?.length || 0;
    return `${count} member${count === 1 ? "" : "s"}`;
  };

  const getAvailableUsersForActiveRoom = () => {
    if (!activeRoom || activeRoom.isPrivate) return [];
    const memberIds = (activeRoom.members || []).map((m) => m._id);
    return users.filter((u) => !memberIds.includes(u._id));
  };

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    socketRef.current = getSocket(token);
    socketRef.current.on("connect_error", () => {
      setError("Socket connection failed. Please re-login.");
    });
    socketRef.current.on("socket_error", (msg) => {
      setAlert(msg || "Something went wrong.");
    });
    socketRef.current.on("receive_message", (message) => {
      if (message.roomId === activeRoomRef.current?._id) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === message._id)) return prev;
          return [...prev, message];
        });
      }
      setRooms((prev) => {
        const updated = prev.map((room) =>
          room._id === message.roomId ? { ...room, updatedAt: new Date().toISOString() } : room
        );
        return sortRoomsByLatest(updated);
      });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off("receive_message");
        socketRef.current.off("socket_error");
        socketRef.current.off("connect_error");
      }
      disconnectSocket();
    };
  }, [navigate]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [roomRes, userRes] = await Promise.all([
          api.get("/rooms"),
          api.get("/users"),
        ]);
        setRooms(sortRoomsByLatest(roomRes.data));
        setUsers(userRes.data);
        if (roomRes.data.length > 0) {
          setActiveRoom(roomRes.data[0]);
        }
      } catch (err) {
        setError(err.response?.data?.message || "Unable to load data.");
      } finally {
        setLoadingRooms(false);
      }
    };

    loadInitialData();
  }, []);

  useEffect(() => {
    const loadMessages = async () => {
      if (!activeRoom) return;
      setSelectedAddMemberId("");
      setLoadingMessages(true);
      setError("");
      try {
        const { data } = await api.get(`/rooms/${activeRoom._id}/messages`);
        setMessages(data);
        socketRef.current?.emit("join_room", activeRoom._id);
      } catch (err) {
        setError(err.response?.data?.message || "Unable to load messages.");
      } finally {
        setLoadingMessages(false);
      }
    };
    loadMessages();
  }, [activeRoom]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!alert) return;
    const id = setTimeout(() => setAlert(""), 2500);
    return () => clearTimeout(id);
  }, [alert]);

  const createRoom = async () => {
    if (!newRoomName.trim()) return;
    try {
      const { data } = await api.post("/rooms", { name: newRoomName.trim() });
      setRooms((prev) => sortRoomsByLatest([data, ...prev]));
      setActiveRoom(data);
      setNewRoomName("");
      setAlert("Room created.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create room.");
    }
  };

  const createPrivateChat = async () => {
    if (!selectedUserId) return;
    const selectedUser = users.find((u) => u._id === selectedUserId);

    const existingPrivateRoom = rooms.find((room) => {
      if (!room.isPrivate) return false;
      const memberIds = (room.members || []).map((m) => m._id);
      return memberIds.includes(user._id) && memberIds.includes(selectedUserId);
    });

    if (existingPrivateRoom) {
      setActiveRoom(existingPrivateRoom);
      setSelectedUserId("");
      setAlert("Opened existing private chat.");
      return;
    }

    try {
      const { data } = await api.post("/rooms", {
        name: `Private: ${selectedUser?.name || "Chat"}`,
        memberIds: [selectedUserId],
        isPrivate: true,
      });
      setRooms((prev) => {
        const exists = prev.some((room) => room._id === data._id);
        const merged = exists ? prev : [data, ...prev];
        return sortRoomsByLatest(merged);
      });
      setSelectedUserId("");
      setActiveRoom(data);
      setAlert("Private chat ready.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create private chat.");
    }
  };

  const send = async () => {
    if (!activeRoom || (!newMessage.trim() && !selectedFile) || sending) return;
    setSending(true);
    setError("");
    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.append("roomId", activeRoom._id);
        formData.append("message", newMessage);
        formData.append("media", selectedFile);
        await api.post("/messages", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        socketRef.current?.emit("send_message", {
          roomId: activeRoom._id,
          message: newMessage,
        });
      }
      setNewMessage("");
      setSelectedFile(null);
    } catch (err) {
      setError(err.response?.data?.message || "Message send failed.");
    } finally {
      setSending(false);
    }
  };

  const addMemberToRoom = async () => {
    if (!activeRoom || activeRoom.isPrivate || !selectedAddMemberId) return;
    try {
      const { data } = await api.post(`/rooms/${activeRoom._id}/members`, {
        memberId: selectedAddMemberId,
      });
      setRooms((prev) => sortRoomsByLatest(prev.map((room) => (room._id === data._id ? data : room))));
      setActiveRoom(data);
      setSelectedAddMemberId("");
      setAlert("Member added to room.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add member.");
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    disconnectSocket();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-sky-50 to-slate-200">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-lg overflow-hidden border border-white">
          <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between bg-white">
            <h1 className="text-lg md:text-xl font-semibold text-slate-800 tracking-tight">
              Real-Time Chat App
            </h1>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1.5">
                <span className="h-7 w-7 rounded-full bg-slate-800 text-white text-xs font-semibold flex items-center justify-center">
                  {(user.name || "U").slice(0, 1).toUpperCase()}
                </span>
                <span className="text-sm text-slate-700">{user.name}</span>
              </div>
              <button
                onClick={logout}
                className="text-sm bg-slate-800 text-white px-3 py-1.5 rounded-md hover:bg-slate-700"
              >
                Logout
              </button>
            </div>
          </div>
          {(error || alert) && (
            <div className="px-4 py-2 border-b border-slate-200">
              {error && <p className="text-sm text-red-600">{error}</p>}
              {!error && alert && <p className="text-sm text-emerald-700">{alert}</p>}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 min-h-[78vh]">
            <aside className="md:col-span-1 border-r border-slate-200 p-4 space-y-4 bg-slate-50/70">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Your rooms</p>
                  <p className="text-lg font-semibold text-slate-800">{rooms.length}</p>
                </div>
                <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                  <p className="text-[11px] text-slate-500">People</p>
                  <p className="text-lg font-semibold text-slate-800">{users.length + 1}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">Create Room</p>
                <div className="flex gap-2">
                  <input
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="Room name"
                    className="flex-1 border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={createRoom}
                    className="bg-blue-600 text-white rounded-md px-3 text-sm hover:bg-blue-500"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">Private Chat</p>
                <div className="flex gap-2">
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="flex-1 border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                  >
                    <option value="">Select user</option>
                    {users.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={createPrivateChat}
                    className="bg-emerald-600 text-white rounded-md px-3 text-sm hover:bg-emerald-500"
                  >
                    Start
                  </button>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Rooms</p>
                {loadingRooms ? (
                  <p className="text-sm text-slate-500">Loading rooms...</p>
                ) : (
                  <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                    {rooms.map((room) => (
                      <button
                        key={room._id}
                        onClick={() => setActiveRoom(room)}
                        className={`w-full text-left px-3 py-2 rounded-md border text-sm ${
                          activeRoom?._id === room._id
                            ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        <p className="font-medium truncate">{getRoomTitle(room)}</p>
                        <p className="text-xs opacity-80">{getRoomSubtitle(room)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </aside>

            <section className="md:col-span-2 flex flex-col">
              <div className="border-b border-slate-200 px-4 py-3 bg-white">
                <h2 className="font-semibold text-slate-800">{getRoomTitle(activeRoom)}</h2>
                {activeRoom && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {getRoomSubtitle(activeRoom)}
                  </p>
                )}
                {activeRoom && !activeRoom.isPrivate && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-700 mb-2">Room members</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {(activeRoom.members || []).map((member) => (
                        <span
                          key={member._id}
                          className="text-xs bg-white border border-slate-200 text-slate-700 rounded-full px-2 py-1"
                        >
                          {member.name}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={selectedAddMemberId}
                        onChange={(e) => setSelectedAddMemberId(e.target.value)}
                        className="border border-slate-300 rounded-md px-2 py-1.5 text-sm sm:max-w-xs"
                      >
                        <option value="">Add user to this room</option>
                        {getAvailableUsersForActiveRoom().map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={addMemberToRoom}
                        disabled={!selectedAddMemberId}
                        className="bg-indigo-600 text-white rounded-md px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-indigo-500"
                      >
                        Add member
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 p-4 overflow-y-auto bg-gradient-to-b from-slate-50 to-slate-100">
                {!activeRoom ? (
                  <p className="text-slate-500 text-sm">No room selected.</p>
                ) : loadingMessages ? (
                  <p className="text-slate-500 text-sm">Loading messages...</p>
                ) : messages.length === 0 ? (
                  <p className="text-slate-500 text-sm">No messages yet.</p>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg) => {
                      const mine = msg.senderId?._id === user._id;
                      const mediaPath = msg.mediaUrl
                        ? `${baseSocketUrl}${msg.mediaUrl}`
                        : "";

                      return (
                        <div
                          key={msg._id}
                          className={`flex ${mine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] md:max-w-[70%] rounded-xl px-3 py-2 shadow-sm ${
                              mine ? "bg-blue-600 text-white" : "bg-white text-slate-800 border border-slate-100"
                            }`}
                          >
                            <p className="text-xs font-semibold mb-1 opacity-90">
                              {msg.senderId?.name || "Unknown"}
                            </p>
                            {msg.message && (
                              <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                            )}
                            {msg.mediaUrl && msg.mediaType === "image" && (
                              <img
                                src={mediaPath}
                                alt="upload"
                                className="mt-2 rounded-md max-h-56 object-cover"
                              />
                            )}
                            {msg.mediaUrl && msg.mediaType === "file" && (
                              <a
                                href={mediaPath}
                                target="_blank"
                                rel="noreferrer"
                                className={`mt-2 text-xs underline block ${
                                  mine ? "text-slate-100" : "text-blue-600"
                                }`}
                              >
                                Open file
                              </a>
                            )}
                            <p className="text-[11px] mt-1 opacity-80">
                              {formatTime(msg.timestamp || msg.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messageEndRef} />
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 p-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder="Type a message"
                    className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                  <input
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="text-sm border border-slate-300 rounded-md p-2"
                  />
                  <button
                    onClick={send}
                    disabled={sending || !activeRoom}
                    className="bg-slate-800 text-white rounded-md px-4 py-2 text-sm disabled:opacity-50 hover:bg-slate-700"
                  >
                    {sending ? "Sending..." : "Send"}
                  </button>
                </div>
                {selectedFile && (
                  <p className="text-xs text-slate-500 mt-2">
                    Selected file: {selectedFile.name}
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
