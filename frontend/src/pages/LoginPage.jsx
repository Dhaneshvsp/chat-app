import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";

function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) navigate("/chat");
  }, [navigate]);

  const onChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", form);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/chat");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-sky-50 to-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white/95 shadow-lg rounded-xl p-6 border border-white">
        <h1 className="text-2xl font-semibold text-slate-800 mb-1">Login</h1>
        <p className="text-sm text-slate-500 mb-5">Welcome back to chat dashboard</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="email"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={onChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={onChange}
            minLength={6}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-800 text-white rounded-lg py-2 font-medium hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? "Please wait..." : "Login"}
          </button>
        </form>
        <p className="text-sm mt-4 text-slate-600">
          New user?{" "}
          <Link to="/signup" className="text-blue-600 font-medium">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
