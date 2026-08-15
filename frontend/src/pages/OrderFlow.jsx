import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Minus, Plus, ArrowLeft, Phone, MessageCircle, AlertTriangle, Ticket, Wallet, Share2 } from "lucide-react";
import { API, useAuth } from "../context/AuthContext";
import { ProductVisual } from "../components/ProductVisual";

const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PAYMENTS = ["Dinheiro", "PIX", "Cartão na entrega"];

export default function OrderFlow() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [product, setProduct] = useState(null);
  const [allProducts, setAllProducts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [settings, setSettings] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    customer_name: "", phone: "", cep: "", street: "", number: "",
    complement: "", neighborhood: "", city: "", payment_method: "PIX", note: "",
  });
  const [cepError, setCepError] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [useCredit, setUseCredit] = useState(false);
  const [referralInfo, setReferralInfo] = useState(null);
  const [loyaltyInfo, setLoyaltyInfo] = useState(null);
  const submitted = useRef(false);
  const repeat = location.state?.repeat;
  const isBusiness = user?.account_type === "comercio";

  useEffect(() => {
    axios.get(`${API}/products`).then((r) => {
      const p = r.data.find((x) => x.id === productId);
      if (!p) { navigate("/"); return; }
      setProduct(p);
      setAllProducts(r.data);
      setQuantities((q) => (Object.keys(q).length ? q : { [p.id]: 1 }));
    });
    axios.get(`${API}/settings`).then((r) => setSettings(r.data));
  }, [productId, navigate]);

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        customer_name: f.customer_name || user.name,
        phone: f.phone || user.phone || "",
        ...(user.saved_address ? {
          cep: user.saved_address.cep, street: user.saved_address.street,
          number: user.saved_address.number, complement: user.saved_address.complement || "",
          neighborhood: user.saved_address.neighborhood, city: user.saved_address.city,
        } : {}),
      }));
      axios.get(`${API}/referral/me`, { withCredentials: true }).then((r) => setReferralInfo(r.data)).catch(() => {});
      axios.get(`${API}/loyalty/me`, { withCredentials: true }).then((r) => setLoyaltyInfo(r.data)).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (repeat) {
      const a = repeat.address;
      const q = {};
      repeat.items.forEach((it) => { q[it.product_id] = it.qty; });
      setQuantities(q);
      setForm((f) => ({
        ...f, customer_name: repeat.customer_name, phone: repeat.phone,
        cep: a.cep, street: a.street, number: a.number, complement: a.complement || "",
        neighborhood: a.neighborhood, city: a.city, payment_method: repeat.payment_method, note: repeat.note || "",
      }));
      setStep(3);
      toast.success("Pedido anterior carregado! Revise e envie.");
    }
  }, [repeat]);

  const setQtyFor = (id, delta) => setQuantities((q) => ({ ...q, [id]: Math.min(20, Math.max(0, (q[id] || 0) + delta)) }));

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleCep = async (e) => {
    const cep = e.target.value.replace(/\D/g, "").slice(0, 8);
    setForm((f) => ({ ...f, cep }));
    setCepError("");
    if (cep.length === 8) {
      try {
        const r = await axios.get(`https://viacep.com.br/ws/${cep}/json/`);
        if (r.data.erro) { setCepError("CEP não encontrado — confira o número ou preencha o endereço manualmente"); return; }
        const city = r.data.localidade || "";
        setForm((f) => ({ ...f, street: r.data.logradouro || f.street, neighborhood: r.data.bairro || f.neighborhood, city }));
        if (!city.toLowerCase().includes("joão pessoa") && !city.toLowerCase().includes("joao pessoa")) {
          setCepError("Só entregamos em João Pessoa");
        } else {
          toast.success("Endereço encontrado!");
        }
      } catch {
        setCepError("Erro ao buscar CEP");
      }
    }
  };

  const outsideCity = form.city && !form.city.toLowerCase().replace("ã", "a").includes("joao pessoa");
  const formValid = form.customer_name && form.phone.replace(/\D/g, "").length >= 10 &&
    form.cep.length === 8 && form.street && form.number && form.city && !outsideCity;

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    try {
      const r = await axios.post(`${API}/coupons/validate`, { code: couponCode }, { withCredentials: true });
      setAppliedCoupon(r.data);
      toast.success(`Cupom ${r.data.code} aplicado!`);
    } catch (err) {
      setAppliedCoupon(null);
      toast.error(err.response?.data?.detail || "Cupom inválido");
    }
  };

  const submit = async () => {
    if (submitted.current || sending) return;
    submitted.current = true;
    setSending(true);
    try {
      const r = await axios.post(`${API}/orders`, {
        customer_name: form.customer_name,
        phone: form.phone,
        items: cartItems.map((it) => ({ product_id: it.id, name: it.name, price: it.unit, qty: it.qty })),
        payment_method: form.payment_method,
        address: {
          cep: form.cep, street: form.street, number: form.number,
          complement: form.complement, neighborhood: form.neighborhood, city: form.city,
        },
        note: form.note,
        coupon_code: loyaltyApplies ? "" : (appliedCoupon?.code || ""),
        use_credit: loyaltyApplies ? false : useCredit,
        referral_code: localStorage.getItem("sf_ref") || "",
      }, { withCredentials: true });
      setResult(r.data);
      window.open(r.data.whatsapp_url, "_blank");
      setStep(4);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao enviar pedido");
      submitted.current = false;
    } finally {
      setSending(false);
    }
  };

  if (!product) return <div className="min-h-[50vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const priceFor = (p) => (form.payment_method === "Cartão na entrega" && p.card_price ? p.card_price : p.price);
  const cartItems = allProducts
    .filter((p) => (quantities[p.id] || 0) > 0)
    .map((p) => ({ id: p.id, name: p.name, qty: quantities[p.id], unit: priceFor(p) }));
  const totalQty = cartItems.reduce((s, it) => s + it.qty, 0);
  const subtotal = cartItems.reduce((s, it) => s + it.unit * it.qty, 0);
  const loyaltyApplies = Boolean(loyaltyInfo?.next_is_discount && !isBusiness);
  const loyaltyAmount = loyaltyApplies ? Math.min(settings?.loyalty_discount_value ?? 10, subtotal) : 0;
  const couponDiscount = appliedCoupon && !isBusiness && !loyaltyApplies
    ? (appliedCoupon.type === "percent" ? subtotal * appliedCoupon.value / 100 : Math.min(appliedCoupon.value, subtotal))
    : 0;
  const availableCredit = referralInfo?.credit || 0;
  const creditUsed = useCredit && !isBusiness && !loyaltyApplies ? Math.min(availableCredit, Math.max(subtotal - couponDiscount, 0)) : 0;
  const total = isBusiness ? 0 : Math.max(subtotal - couponDiscount - creditUsed - loyaltyAmount, 0);

  return (
    <div className="max-w-md mx-auto px-5 pb-32">
      <button onClick={() => (step === 1 || step === 4 ? navigate("/") : setStep(step - 1))} data-testid="order-back-button"
        className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      {settings && !settings.store_open && step < 4 && (
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 flex gap-2 items-center" data-testid="closed-warning">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Estamos fechados — seu pedido será atendido na abertura.
        </div>
      )}

      {step === 1 && (
        <>
        <div className="mt-6 mb-32 fade-up">
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: "Manrope" }}>Monte seu pedido</h1>
          <p className="text-sm text-muted-foreground mt-1">Pode pedir gás e água juntos na mesma entrega.</p>
          {isBusiness && (
            <p className="text-sm font-bold text-primary mt-2" data-testid="business-price-note">Conta comércio: preço a combinar com o atendimento.</p>
          )}
          <div className="mt-4 space-y-4">
            {allProducts.map((p, i) => {
              const q = quantities[p.id] || 0;
              return (
                <div key={p.id} className={`bg-white rounded-3xl border shadow-sm overflow-hidden transition-colors ${q > 0 ? "border-primary" : "border-border"}`} data-testid={`cart-product-${i}`}>
                  <div className="flex items-center gap-4 p-4">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="scale-[0.45] origin-top-left w-[222px] h-[222px]"><ProductVisual visual={p.visual} name={p.name} /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold leading-tight" style={{ fontFamily: "Manrope" }}>{p.name}</p>
                      {isBusiness ? (
                        <p className="text-sm font-bold text-primary mt-0.5">A combinar</p>
                      ) : (
                        <>
                          <p className="text-lg font-extrabold text-primary mt-0.5" data-testid={`cart-price-${i}`}>{brl(p.price)}</p>
                          {p.card_price && <p className="text-xs text-muted-foreground">{brl(p.card_price)} no cartão</p>}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <button onClick={() => setQtyFor(p.id, -1)} data-testid={`qty-decrease-${i}`} disabled={q <= 0}
                        className="w-11 h-11 rounded-full border-2 border-border flex items-center justify-center hover:bg-muted active:scale-[0.95] transition-colors transition-transform disabled:opacity-30">
                        <Minus className="w-5 h-5" />
                      </button>
                      <span className="text-xl font-extrabold w-7 text-center" data-testid={`qty-value-${i}`} style={{ fontFamily: "Manrope" }}>{q}</span>
                      <button onClick={() => setQtyFor(p.id, 1)} data-testid={`qty-increase-${i}`}
                        className="w-11 h-11 rounded-full border-2 border-border flex items-center justify-center hover:bg-muted active:scale-[0.95] transition-colors transition-transform">
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border p-4 z-30">
            <div className="max-w-md mx-auto flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{totalQty} {totalQty === 1 ? "item" : "itens"}</p>
                <p className="text-xl font-extrabold text-foreground" data-testid="step1-total" style={{ fontFamily: "Manrope" }}>{isBusiness ? "A combinar" : brl(subtotal)}</p>
              </div>
              <button onClick={() => setStep(2)} disabled={totalQty === 0} data-testid="continue-to-form"
                className="h-14 px-8 rounded-full bg-secondary text-white text-lg font-bold shadow-md hover:bg-secondary/90 active:scale-[0.98] transition-colors transition-transform">
                Continuar
              </button>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
        <div className="mt-6 fade-up space-y-4">
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: "Manrope" }}>Dados da entrega</h1>
          <div>
            <label className="font-medium text-sm block mb-1.5">Nome completo *</label>
            <input value={form.customer_name} onChange={set("customer_name")} data-testid="input-name"
              className="w-full h-14 rounded-xl border border-input px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Seu nome" />
          </div>
          <div>
            <label className="font-medium text-sm block mb-1.5">Telefone / WhatsApp *</label>
            <input value={form.phone} onChange={set("phone")} type="tel" data-testid="input-phone"
              className="w-full h-14 rounded-xl border border-input px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-ring" placeholder="(83) 99999-9999" />
          </div>
          <div>
            <label className="font-medium text-sm block mb-1.5">CEP *</label>
            <input value={form.cep} onChange={handleCep} type="tel" inputMode="numeric" data-testid="input-cep"
              className="w-full h-14 rounded-xl border border-input px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-ring" placeholder="58000000" />
            {cepError && <p className="text-sm text-red-600 font-semibold mt-1.5" data-testid="cep-error">{cepError}</p>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="font-medium text-sm block mb-1.5">Rua *</label>
              <input value={form.street} onChange={set("street")} data-testid="input-street"
                className="w-full h-14 rounded-xl border border-input px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="font-medium text-sm block mb-1.5">Número *</label>
              <input value={form.number} onChange={set("number")} data-testid="input-number"
                className="w-full h-14 rounded-xl border border-input px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium text-sm block mb-1.5">Complemento</label>
              <input value={form.complement} onChange={set("complement")} data-testid="input-complement"
                className="w-full h-14 rounded-xl border border-input px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Apto, bloco..." />
            </div>
            <div>
              <label className="font-medium text-sm block mb-1.5">Bairro</label>
              <input value={form.neighborhood} onChange={set("neighborhood")} data-testid="input-neighborhood"
                className="w-full h-14 rounded-xl border border-input px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="font-medium text-sm block mb-1.5">Forma de pagamento *</label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENTS.map((p) => (
                <button key={p} onClick={() => setForm((f) => ({ ...f, payment_method: p }))}
                  data-testid={`payment-${p === "Cartão na entrega" ? "cartao" : p.toLowerCase()}`}
                  className={`h-12 rounded-xl border text-sm font-semibold transition-colors ${form.payment_method === p ? "bg-primary text-white border-primary" : "bg-white border-input hover:bg-muted"}`}>
                  {p === "Cartão na entrega" ? "Cartão" : p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="font-medium text-sm block mb-1.5">Observação</label>
            <textarea value={form.note} onChange={set("note")} data-testid="input-note" rows={2}
              className="w-full rounded-xl border border-input px-4 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Ponto de referência, troco..." />
            {product.card_price && form.payment_method === "Cartão na entrega" && (
              <p className="text-xs text-muted-foreground -mt-1" data-testid="card-price-note">Preço no cartão: {brl(product.card_price)} / unidade</p>
            )}
          </div>
          {loyaltyApplies && (
            <div className="rounded-2xl bg-orange-50 border border-orange-200 p-4 text-sm text-orange-800 font-semibold" data-testid="loyalty-applies-banner">
              🎁 Este é seu 6º pedido: R$ 10 de desconto de fidelidade aplicado automaticamente! (não combinável com cupons ou crédito)
            </div>
          )}
          {!isBusiness && !loyaltyApplies && (
            <div>
              <label className="font-medium text-sm block mb-1.5">Cupom de desconto</label>
              <div className="flex gap-2">
                <input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} data-testid="input-coupon"
                  className="flex-1 h-14 rounded-xl border border-input px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-ring uppercase" placeholder="Ex: BEMVINDO" />
                <button onClick={applyCoupon} data-testid="apply-coupon-button"
                  className="h-14 px-5 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors">
                  Aplicar
                </button>
              </div>
              {appliedCoupon && (
                <p className="text-sm text-green-700 font-semibold mt-1.5 flex items-center gap-1.5" data-testid="coupon-applied">
                  <Ticket className="w-4 h-4" /> Cupom {appliedCoupon.code}: {appliedCoupon.type === "percent" ? `${appliedCoupon.value}%` : brl(appliedCoupon.value)} de desconto
                </p>
              )}
            </div>
          )}
          {user && availableCredit > 0 && !loyaltyApplies && (
            <label className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 cursor-pointer" data-testid="use-credit-toggle">
              <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} className="w-5 h-5 accent-[#16a34a]" data-testid="use-credit-checkbox" />
              <span className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
                <Wallet className="w-4 h-4" /> Usar meu crédito de indicação ({brl(availableCredit)})
              </span>
            </label>
          )}
          {outsideCity && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-semibold" data-testid="outside-city-error">
              Só entregamos em João Pessoa. Infelizmente não podemos atender seu endereço.
            </div>
          )}
        </div>
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border p-4 z-30">
            <div className="max-w-md mx-auto">
              <button onClick={() => setStep(3)} disabled={!formValid} data-testid="continue-to-summary"
                className="w-full h-14 rounded-full bg-secondary text-white text-lg font-bold shadow-md hover:bg-secondary/90 active:scale-[0.98] transition-colors transition-transform disabled:opacity-40 disabled:pointer-events-none">
                Revisar pedido
              </button>
            </div>
          </div>
        </>
      )}

      {step === 3 && (
        <>
        <div className="mt-6 fade-up">
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: "Manrope" }}>Resumo do pedido</h1>
          <div className="mt-4 bg-white rounded-3xl border border-border shadow-sm p-6 space-y-4" data-testid="order-summary">
            <div className="space-y-2">
              {cartItems.map((it, i) => (
                <div key={it.id} className="flex justify-between items-center" data-testid={`summary-item-${i}`}>
                  <p className="font-semibold">{it.qty}x {it.name}</p>
                  <p className="font-bold">{isBusiness ? "A combinar" : brl(it.unit * it.qty)}</p>
                </div>
              ))}
            </div>
            <hr className="border-border" />
            <div className="text-sm space-y-1.5 text-muted-foreground">
              <p><strong className="text-foreground">Nome:</strong> {form.customer_name}</p>
              <p><strong className="text-foreground">Telefone:</strong> {form.phone}</p>
              <p><strong className="text-foreground">Endereço:</strong> {form.street}, {form.number}{form.complement && ` (${form.complement})`} — {form.neighborhood}, {form.city}</p>
              <p><strong className="text-foreground">Pagamento:</strong> {form.payment_method}</p>
              {form.note && <p><strong className="text-foreground">Obs:</strong> {form.note}</p>}
            </div>
            <hr className="border-border" />
            {!isBusiness && (couponDiscount > 0 || creditUsed > 0 || loyaltyAmount > 0) && (
              <div className="text-sm space-y-1">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
                {couponDiscount > 0 && <div className="flex justify-between text-green-700 font-semibold" data-testid="summary-coupon-discount"><span>Cupom {appliedCoupon.code}</span><span>-{brl(couponDiscount)}</span></div>}
                {creditUsed > 0 && <div className="flex justify-between text-green-700 font-semibold" data-testid="summary-credit-discount"><span>Crédito de indicação</span><span>-{brl(creditUsed)}</span></div>}
                {loyaltyAmount > 0 && <div className="flex justify-between text-orange-700 font-semibold" data-testid="summary-loyalty-discount"><span>🎁 Fidelidade (6º pedido)</span><span>-{brl(loyaltyAmount)}</span></div>}
              </div>
            )}
            {isBusiness && useCredit && availableCredit > 0 && (
              <p className="text-sm text-green-700 font-semibold" data-testid="summary-business-credit">Crédito de {brl(availableCredit)} será informado no pedido para abater na negociação</p>
            )}
            <div className="flex justify-between items-center">
              <p className="font-bold text-lg" style={{ fontFamily: "Manrope" }}>Total</p>
              <p className="font-extrabold text-2xl text-primary" data-testid="summary-total" style={{ fontFamily: "Manrope" }}>{isBusiness ? "A combinar" : brl(total)}</p>
            </div>
          </div>
        </div>
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border p-4 z-30">
            <div className="max-w-md mx-auto">
              <button onClick={submit} disabled={sending} data-testid="send-whatsapp-button"
                className="w-full h-14 rounded-full bg-[#25D366] text-white text-lg font-bold shadow-md hover:bg-[#20bd5a] active:scale-[0.98] transition-colors transition-transform disabled:opacity-50 flex items-center justify-center gap-2">
                <MessageCircle className="w-6 h-6" />
                {sending ? "Enviando..." : "Enviar pedido no WhatsApp"}
              </button>
            </div>
          </div>
        </>
      )}

      {step === 4 && result && (
        <div className="mt-10 text-center fade-up" data-testid="order-success">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <MessageCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight mt-5" style={{ fontFamily: "Manrope" }}>Pedido enviado!</h1>
          <p className="text-muted-foreground mt-2">Seu WhatsApp deve ter aberto com a mensagem pronta. Se não abriu, use os botões abaixo.</p>
          {result.loyalty_discount && (
            <div className="mt-4 rounded-2xl bg-orange-100 text-orange-700 font-bold p-4" data-testid="loyalty-discount-notice">
              🎁 Este pedido tem desconto de fidelidade!
            </div>
          )}
          {result.referral_unlocked_now && (
            <div className="mt-4 rounded-2xl bg-accent text-accent-foreground font-semibold p-4 text-sm flex items-start gap-2 text-left" data-testid="referral-unlocked-notice">
              <Share2 className="w-5 h-5 shrink-0 mt-0.5" />
              <span>Você desbloqueou o <strong>Indique e Ganhe</strong>! Compartilhe seu link em "Meus pedidos" e ganhe crédito a cada indicação.</span>
            </div>
          )}
          <div className="mt-6 space-y-3">
            <a href={result.whatsapp_url} target="_blank" rel="noopener noreferrer" data-testid="reopen-whatsapp-button"
              className="w-full h-14 rounded-full bg-[#25D366] text-white text-lg font-bold flex items-center justify-center gap-2 hover:bg-[#20bd5a] transition-colors">
              <MessageCircle className="w-5 h-5" /> Abrir WhatsApp
            </a>
            <a href={result.phone_fallback} data-testid="call-fallback-button"
              className="w-full h-14 rounded-full border-2 border-primary text-primary text-lg font-bold flex items-center justify-center gap-2 hover:bg-accent transition-colors">
              <Phone className="w-5 h-5" /> Ligar para a loja
            </a>
            <button onClick={() => navigate("/")} data-testid="back-home-button"
              className="w-full h-12 rounded-full text-muted-foreground font-semibold hover:text-foreground transition-colors">
              Voltar ao início
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
