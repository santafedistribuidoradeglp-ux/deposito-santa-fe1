import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Printer, ArrowLeft } from "lucide-react";
import { API, useAuth } from "../context/AuthContext";

export default function Selo() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!loading && !user) navigate("/entrar");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) axios.get(`${API}/referral/me`, { withCredentials: true }).then((r) => setInfo(r.data)).catch(() => {});
  }, [user]);

  if (loading || !user || !info) return null;

  const link = `${window.location.origin}/?ref=${info.code}`;
  const qrSrc = `${API}/referral/qr?link=${encodeURIComponent(link)}`;
  const displayName = user.account_type === "comercio" && user.business_name ? user.business_name : user.name;

  return (
    <div className="max-w-md mx-auto px-5 pb-16">
      <div className="flex items-center justify-between mt-4 print:hidden">
        <button onClick={() => navigate(-1)} data-testid="selo-back-button"
          className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <button onClick={() => window.print()} data-testid="selo-print-button"
          className="h-11 px-5 rounded-full bg-secondary text-white text-sm font-bold flex items-center gap-2 hover:bg-secondary/90 transition-colors">
          <Printer className="w-4 h-4" /> Imprimir selo
        </button>
      </div>

      {!info.unlocked && (
        <p className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 print:hidden" data-testid="selo-locked-warning">
          Seu link de indicação ainda não está ativo — {user.account_type === "comercio" ? "aguarde a aprovação do seu comércio" : "compre 1 botijão P13 para ativar"}. O QR abaixo só dará crédito depois disso.
        </p>
      )}

      <div className="mt-6 rounded-3xl border-4 border-[#0c2d48] bg-white overflow-hidden print:mt-0" data-testid="selo-card">
        <div className="bg-[#0c2d48] text-white text-center py-5 px-6">
          <img src="/images/logo-mark.png" alt="Santa Fé" className="w-14 h-14 rounded-full mx-auto border-2 border-white/50" />
          <p className="text-xl font-extrabold tracking-tight mt-2" style={{ fontFamily: "Manrope" }}>Parceiro Santa Fé</p>
          <p className="text-xs text-white/70 uppercase tracking-widest">Distribuidora de Gás e Água</p>
        </div>
        <div className="p-6 text-center">
          <p className="font-bold text-lg" style={{ fontFamily: "Manrope" }} data-testid="selo-name">{displayName}</p>
          <img src={qrSrc} alt="QR Code" className="w-52 h-52 mx-auto mt-4 border border-border rounded-2xl" data-testid="selo-qr" />
          <p className="text-sm font-semibold mt-4">Aponte a câmera e peça gás e água<br />com entrega em João Pessoa!</p>
          <p className="text-xs text-muted-foreground mt-2">Código: {info.code} · (83) 99917-0131 · Todos os dias 7h–19h</p>
        </div>
      </div>
    </div>
  );
}
