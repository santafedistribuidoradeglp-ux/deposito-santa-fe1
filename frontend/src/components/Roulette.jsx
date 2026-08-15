import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Gift, Copy } from "lucide-react";
import { API, useAuth } from "../context/AuthContext";

const SEGMENTS = ["Gire novamente", "Tente mais tarde", "R$ 5 no gás", "R$ 10 no gás", "R$ 2 na água"];
const COLORS = ["#0284c7", "#64748b", "#f97316", "#d97706", "#0ea5e9"];

const fmt = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export const Roulette = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [remaining, setRemaining] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);
  const [myCoupons, setMyCoupons] = useState([]);
  const timer = useRef(null);

  useEffect(() => {
    if (user) {
      axios.get(`${API}/roulette/status`, { withCredentials: true }).then((r) => {
        setRemaining(r.data.seconds_remaining);
        setMyCoupons(r.data.my_coupons);
      }).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (remaining > 0) {
      timer.current = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
      return () => clearInterval(timer.current);
    }
  }, [remaining > 0]);

  const spin = async () => {
    if (!user) { navigate("/entrar"); return; }
    if (spinning || remaining > 0) return;
    setSpinning(true);
    setResult(null);
    try {
      const r = await axios.post(`${API}/roulette/spin`, {}, { withCredentials: true });
      const idx = r.data.prize_index;
      const target = 360 * 6 + (360 - (idx * 72 + 36));
      setRotation((prev) => prev + target - (prev % 360));
      setTimeout(() => {
        setResult(r.data);
        setSpinning(false);
        setRemaining(r.data.seconds_remaining);
        if (r.data.type === "coupon") {
          toast.success(`🎉 Você ganhou ${r.data.label}! Cupom: ${r.data.coupon_code}`);
          setMyCoupons((c) => [...c, { code: r.data.coupon_code, label: r.data.label }]);
        } else if (r.data.type === "respin") {
          toast.success("🎰 Gire novamente — mais uma chance!");
        } else {
          toast("😅 Não foi dessa vez. Tente novamente em 24 horas!");
        }
      }, 4200);
    } catch (e) {
      setSpinning(false);
      toast.error(e.response?.data?.detail || "Erro ao girar");
    }
  };

  const gradient = `conic-gradient(${SEGMENTS.map((_, i) => `${COLORS[i]} ${i * 72}deg ${(i + 1) * 72}deg`).join(", ")})`;

  return (
    <section className="max-w-6xl mx-auto px-5 pb-4">
      <div className="rounded-3xl bg-[#0c2d48] text-white p-6 md:p-8 text-center relative overflow-hidden" data-testid="roulette-box">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest bg-white/10 border border-white/15 rounded-full px-4 py-1.5">
          <Gift className="w-3.5 h-3.5 text-secondary" /> Roleta da sorte
        </span>
        <h2 className="text-2xl font-extrabold tracking-tight mt-2" style={{ fontFamily: "Manrope" }}>Gire e ganhe desconto!</h2>
        <p className="text-sm text-white/70 mt-1">1 giro grátis por dia · prêmios viram cupom na hora</p>

        <div className="relative w-56 h-56 mx-auto mt-6">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10 w-0 h-0 border-l-[12px] border-r-[12px] border-t-[18px] border-l-transparent border-r-transparent border-t-secondary" />
          <div
            data-testid="roulette-wheel"
            className="w-56 h-56 rounded-full border-4 border-white/80 relative"
            style={{ background: gradient, transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4s cubic-bezier(0.2, 0.8, 0.2, 1)" : "none" }}
          >
            {SEGMENTS.map((s, i) => (
              <span key={s} className="absolute left-1/2 top-1/2 text-[9px] font-bold text-white w-24 text-center leading-tight"
                style={{ transform: `rotate(${i * 72 + 36}deg) translateY(-78px) translateX(-50%)` }}>
                {s}
              </span>
            ))}
          </div>
          <div className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-lg">
            <img src="/images/logo-mark.png" alt="Santa Fé" className="w-11 h-11 rounded-full" />
          </div>
        </div>

        {remaining > 0 && !spinning ? (
          <div className="mt-5" data-testid="roulette-countdown">
            <p className="text-sm font-semibold text-white/80">Tente novamente em</p>
            <p className="text-2xl font-extrabold tracking-widest text-secondary" style={{ fontFamily: "Manrope" }}>{fmt(remaining)}</p>
          </div>
        ) : (
          <button onClick={spin} disabled={spinning} data-testid="roulette-spin-button"
            className="mt-5 h-14 px-10 rounded-full bg-secondary text-white text-lg font-bold shadow-lg shadow-secondary/30 hover:bg-secondary/90 active:scale-[0.98] transition-colors transition-transform disabled:opacity-60">
            {spinning ? "Girando..." : user ? "Girar agora" : "Entrar para girar"}
          </button>
        )}

        {result?.type === "coupon" && (
          <div className="mt-4 inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-5 py-2.5" data-testid="roulette-won-coupon">
            <span className="text-sm font-bold">🎉 {result.label} — cupom <span className="text-secondary">{result.coupon_code}</span></span>
            <button onClick={() => { navigator.clipboard.writeText(result.coupon_code); toast.success("Código copiado!"); }} data-testid="roulette-copy-coupon">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        )}

        {myCoupons.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2" data-testid="roulette-my-coupons">
            {myCoupons.map((c) => (
              <button key={c.code} onClick={() => { navigator.clipboard.writeText(c.code); toast.success(`Cupom ${c.code} copiado!`); }}
                className="text-xs font-bold bg-white/10 border border-white/20 rounded-full px-3 py-1.5 hover:bg-white/20 transition-colors">
                {c.label || "Cupom"} · {c.code}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
