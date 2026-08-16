import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Store, User, Upload, ShieldCheck } from "lucide-react";
import axios from "axios";
import { API, useAuth } from "../context/AuthContext";

const inputCls = "w-full h-14 rounded-xl border border-input px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-ring";

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Algo deu errado. Tente novamente.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default function AuthPage() {
  const { loginPhone, register, login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [accountType, setAccountType] = useState("cliente");
  const [form, setForm] = useState({ name: "", phone: "", password: "", business_name: "", business_address: "" });
  const [facadeFile, setFacadeFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [forgotStep, setForgotStep] = useState(1);
  const [waUrl, setWaUrl] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetPass, setResetPass] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const requestReset = async () => {
    setError("");
    setBusy(true);
    try {
      const r = await axios.post(`${API}/auth/forgot`, { phone: form.phone });
      setWaUrl(r.data.whatsapp_url);
      setForgotStep(2);
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setError("");
    setBusy(true);
    try {
      await axios.post(`${API}/auth/reset`, { phone: form.phone, code: resetCode, new_password: resetPass });
      toast.success("Senha redefinida! Agora faça login.");
      setMode("login");
      setForgotStep(1);
      setResetCode("");
      setResetPass("");
      setForm((f) => ({ ...f, password: "" }));
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await loginPhone(form.phone, form.password);
        toast.success("Bem-vindo de volta!");
      } else {
        let facade_path = "";
        if (accountType === "comercio" && facadeFile) {
          const fd = new FormData();
          fd.append("file", facadeFile);
          const up = await axios.post(`${API}/upload/facade`, fd);
          facade_path = up.data.path;
        }
        await register({ ...form, account_type: accountType, facade_path });
        toast.success(accountType === "comercio" ? "Cadastro enviado! Seu comércio será publicado após aprovação." : "Cadastro concluído! Seu link para indicar amigos já está pronto.");
      }
      navigate("/");
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-5 pb-16">
      <h1 className="text-2xl font-extrabold tracking-tight mt-8" style={{ fontFamily: "Manrope" }} data-testid="auth-title">
        {mode === "login" ? "Entrar" : mode === "forgot" ? "Recuperar senha" : "Criar conta"}
      </h1>
      <p className="text-muted-foreground text-sm mt-1">
        {mode === "login" ? "Use seu telefone e senha." : mode === "forgot" ? "Você receberá um código pelo WhatsApp da loja." : "Ganhe créditos de indicação e acompanhe seus pedidos."}
      </p>

      <div className="grid grid-cols-2 gap-2 mt-6 bg-muted rounded-full p-1">
        <button onClick={() => { setMode("login"); setError(""); }} data-testid="auth-tab-login"
          className={`h-11 rounded-full text-sm font-bold transition-colors ${mode === "login" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}>
          Entrar
        </button>
        <button onClick={() => { setMode("register"); setError(""); }} data-testid="auth-tab-register"
          className={`h-11 rounded-full text-sm font-bold transition-colors ${mode === "register" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}>
          Cadastrar
        </button>
      </div>

      {mode === "forgot" && (
        <div className="mt-6 space-y-4">
          {forgotStep === 1 ? (
            <>
              <div>
                <label className="font-medium text-sm block mb-1.5">Telefone cadastrado (com DDD) *</label>
                <input value={form.phone} onChange={set("phone")} type="tel" data-testid="forgot-phone-input" className={inputCls} placeholder="(83) 99999-9999" />
              </div>
              {error && <p className="text-sm text-red-600 font-semibold" data-testid="auth-error">{error}</p>}
              <button onClick={requestReset} disabled={busy} data-testid="forgot-request-button"
                className="w-full h-14 rounded-full bg-secondary text-white text-lg font-bold shadow-md hover:bg-secondary/90 transition-colors disabled:opacity-50">
                {busy ? "Aguarde..." : "Solicitar código"}
              </button>
            </>
          ) : (
            <>
              <div className="rounded-2xl bg-accent p-4 text-sm text-accent-foreground" data-testid="forgot-instructions">
                Código gerado! Chame a loja no WhatsApp para receber seu <strong>código de 6 dígitos</strong> e digite abaixo com a nova senha.
              </div>
              <a href={waUrl} target="_blank" rel="noopener noreferrer" data-testid="forgot-whatsapp-button"
                className="w-full h-14 rounded-full bg-[#25D366] text-white text-lg font-bold flex items-center justify-center gap-2 hover:bg-[#20bd5a] transition-colors">
                Pedir código no WhatsApp
              </a>
              <div>
                <label className="font-medium text-sm block mb-1.5">Código de 6 dígitos *</label>
                <input value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))} type="tel" inputMode="numeric" data-testid="forgot-code-input" className={inputCls} placeholder="000000" />
              </div>
              <div>
                <label className="font-medium text-sm block mb-1.5">Nova senha *</label>
                <input value={resetPass} onChange={(e) => setResetPass(e.target.value)} type="password" data-testid="forgot-newpass-input" className={inputCls} placeholder="Mínimo 6 caracteres" />
              </div>
              {error && <p className="text-sm text-red-600 font-semibold" data-testid="auth-error">{error}</p>}
              <button onClick={doReset} disabled={busy} data-testid="forgot-reset-button"
                className="w-full h-14 rounded-full bg-secondary text-white text-lg font-bold shadow-md hover:bg-secondary/90 transition-colors disabled:opacity-50">
                {busy ? "Aguarde..." : "Redefinir senha"}
              </button>
            </>
          )}
          <button onClick={() => { setMode("login"); setForgotStep(1); setError(""); }} data-testid="forgot-back-login"
            className="w-full h-11 rounded-full text-muted-foreground text-sm font-semibold hover:text-foreground transition-colors">
            Voltar ao login
          </button>
        </div>
      )}

      {mode !== "forgot" && (
      <div className="mt-6 space-y-4">
        {mode === "register" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setAccountType("cliente")} data-testid="account-type-cliente"
                className={`h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 font-bold text-sm transition-colors ${accountType === "cliente" ? "border-primary bg-accent text-primary" : "border-input bg-white text-muted-foreground"}`}>
                <User className="w-5 h-5" /> Sou cliente
              </button>
              <button onClick={() => setAccountType("comercio")} data-testid="account-type-comercio"
                className={`h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 font-bold text-sm transition-colors ${accountType === "comercio" ? "border-primary bg-accent text-primary" : "border-input bg-white text-muted-foreground"}`}>
                <Store className="w-5 h-5" /> Sou comércio
              </button>
            </div>
            <div>
              <label className="font-medium text-sm block mb-1.5">{accountType === "comercio" ? "Nome do responsável *" : "Nome completo *"}</label>
              <input value={form.name} onChange={set("name")} data-testid="auth-input-name" className={inputCls} placeholder="Seu nome" />
            </div>
            {accountType === "comercio" && (
              <>
                <div>
                  <label className="font-medium text-sm block mb-1.5">Nome do comércio *</label>
                  <input value={form.business_name} onChange={set("business_name")} data-testid="auth-input-business-name" className={inputCls} placeholder="Ex: Mercadinho São José" />
                </div>
                <div>
                  <label className="font-medium text-sm block mb-1.5">Endereço do comércio *</label>
                  <input value={form.business_address} onChange={set("business_address")} data-testid="auth-input-business-address" className={inputCls} placeholder="Rua, número, bairro" />
                </div>
                <div>
                  <label className="font-medium text-sm block mb-1.5">Foto da fachada</label>
                  <label className="w-full h-24 rounded-2xl border-2 border-dashed border-input bg-white flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-muted transition-colors" data-testid="auth-facade-upload">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium">{facadeFile ? facadeFile.name : "Toque para enviar (JPG/PNG, máx 5MB)"}</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFacadeFile(e.target.files?.[0] || null)} />
                  </label>
                  <p className="text-xs text-muted-foreground mt-1.5">Sua fachada aparece na aba Comércios após aprovação — divulgação grátis!</p>
                </div>
              </>
            )}
          </>
        )}
        <div>
          <label className="font-medium text-sm block mb-1.5">Telefone (com DDD) *</label>
          <input value={form.phone} onChange={set("phone")} type="tel" data-testid="auth-input-phone" className={inputCls} placeholder="(83) 99999-9999" />
        </div>
        <div>
          <label className="font-medium text-sm block mb-1.5">Senha *</label>
          <input value={form.password} onChange={set("password")} type="password" data-testid="auth-input-password" className={inputCls} placeholder={mode === "register" ? "Mínimo 6 caracteres" : "Sua senha"} />
        </div>
        {error && <p className="text-sm text-red-600 font-semibold" data-testid="auth-error">{error}</p>}
        <button onClick={submit} disabled={busy} data-testid="auth-submit-button"
          className="w-full h-14 rounded-full bg-secondary text-white text-lg font-bold shadow-md hover:bg-secondary/90 active:scale-[0.98] transition-colors transition-transform disabled:opacity-50">
          {busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
        </button>
        {mode === "login" && (
          <button onClick={() => { setMode("forgot"); setError(""); }} data-testid="forgot-password-link"
            className="w-full text-center text-sm font-semibold text-primary hover:underline">
            Esqueci minha senha
          </button>
        )}
      </div>
      )}

      <button onClick={login} data-testid="admin-google-login"
        className="mt-8 mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ShieldCheck className="w-3.5 h-3.5" /> Acesso administrativo (Google)
      </button>
    </div>
  );
}
