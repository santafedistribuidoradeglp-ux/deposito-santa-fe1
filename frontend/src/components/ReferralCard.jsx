import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Share2, Copy, MessageCircle, Lock, Wallet, Receipt, BadgeCheck } from "lucide-react";
import { API, useAuth } from "../context/AuthContext";

const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const ReferralCard = () => {
  const [info, setInfo] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [showLedger, setShowLedger] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    axios.get(`${API}/referral/me`, { withCredentials: true }).then((r) => setInfo(r.data)).catch(() => {});
  }, []);

  const toggleLedger = () => {
    if (!showLedger && ledger === null) {
      axios.get(`${API}/referral/ledger`, { withCredentials: true }).then((r) => setLedger(r.data)).catch(() => {});
    }
    setShowLedger((s) => !s);
  };

  if (!info) return null;

  const link = `${window.location.origin}/?ref=${info.code}`;
  const qrSrc = `${API}/referral/qr?link=${encodeURIComponent(link)}`;
  const shareMsg = `Peça gás e água na Santa Fé Distribuidora pelo site! Use meu link: ${link}`;

  return (
    <div className="rounded-2xl bg-white border border-border shadow-sm p-5 mt-4" data-testid="referral-card">
      <div className="flex items-center justify-between">
        <p className="font-bold flex items-center gap-2" style={{ fontFamily: "Manrope" }}>
          <Share2 className="w-5 h-5 text-secondary" /> Indique e ganhe
        </p>
        <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-green-700 bg-green-50 rounded-full px-3 py-1.5" data-testid="referral-credit-balance">
          <Wallet className="w-4 h-4" /> {brl(info.credit)}
        </span>
      </div>

      {!info.unlocked ? (
        <div className="mt-4 rounded-xl bg-muted p-4 flex items-start gap-3" data-testid="referral-locked">
          <Lock className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Compre 1 botijão P13</strong> para desbloquear seu link de indicação. Depois, cada pessoa que comprar um P13 pelo seu link te dá <strong className="text-foreground">{brl(info.credit_value)}</strong> de crédito!
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mt-2">
            Cada pessoa que comprar um P13 pelo seu link te dá <strong className="text-foreground">{brl(info.credit_value)}</strong> de crédito para usar quando quiser.
          </p>
          <div className="mt-4 flex items-center gap-4">
            <img src={qrSrc} alt="QR Code de indicação" className="w-28 h-28 rounded-xl border border-border" data-testid="referral-qr" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="rounded-xl bg-muted px-3 py-2.5 text-xs font-mono truncate" data-testid="referral-link">{link}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado!"); }}
                  data-testid="referral-copy-button"
                  className="flex-1 h-11 rounded-full border border-input bg-white text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-muted transition-colors">
                  <Copy className="w-4 h-4" /> Copiar
                </button>
                <a href={`https://wa.me/?text=${encodeURIComponent(shareMsg)}`} target="_blank" rel="noopener noreferrer"
                  data-testid="referral-share-whatsapp"
                  className="flex-1 h-11 rounded-full bg-[#25D366] text-white text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-[#20bd5a] transition-colors">
                  <MessageCircle className="w-4 h-4" /> Enviar
                </a>
              </div>
            </div>
          </div>
        </>
      )}

      {(info.unlocked || user?.account_type === "comercio") && (
        <Link to="/selo" data-testid="selo-link"
          className="mt-4 w-full h-11 rounded-full border border-secondary text-secondary text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-orange-50 transition-colors">
          <BadgeCheck className="w-4 h-4" /> Imprimir selo Parceiro Santa Fé
        </Link>
      )}

      <button onClick={toggleLedger} data-testid="ledger-toggle"
        className="mt-3 w-full h-10 rounded-full text-muted-foreground text-sm font-semibold flex items-center justify-center gap-1.5 hover:text-foreground transition-colors">
        <Receipt className="w-4 h-4" /> {showLedger ? "Ocultar extrato" : "Ver extrato de créditos"}
      </button>
      {showLedger && (
        <div className="mt-2 space-y-2" data-testid="ledger-list">
          {ledger === null ? (
            <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : ledger.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3" data-testid="ledger-empty">Nenhuma movimentação ainda.</p>
          ) : (
            ledger.map((l, i) => (
              <div key={l.id} className="flex items-center justify-between text-sm rounded-xl bg-muted px-3 py-2.5" data-testid={`ledger-item-${i}`}>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{l.description}</p>
                  <p className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <span className={`font-extrabold shrink-0 ${l.type === "ganho" ? "text-green-700" : "text-red-500"}`}>
                  {l.type === "ganho" ? "+" : "-"}{brl(l.amount)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
