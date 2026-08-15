import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import {
  Clock, MapPin, Gift, Truck, ShieldCheck, CreditCard, MessageCircle,
  Zap, Instagram, Phone, Flame,
} from "lucide-react";
import { API, useAuth } from "../context/AuthContext";
import { ProductVisual } from "../components/ProductVisual";
import { toast } from "sonner";
import { Ticket } from "lucide-react";

const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ADDRESS = "Rua Herotildes Bulhões Pinheiros, 166, Cidade Verde, João Pessoa - PB";

export default function Home() {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loyalty, setLoyalty] = useState(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [gdpOpen, setGdpOpen] = useState(0);
  const [highlightGdp, setHighlightGdp] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login } = useAuth();

  const goToGdp = () => {
    setHighlightGdp(true);
    document.querySelector('[data-product="gasdopovo"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setHighlightGdp(false), 3500);
  };

  const checkCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponResult(null);
    setCouponError("");
    try {
      const r = await axios.post(`${API}/coupons/validate`, { code: couponCode }, { withCredentials: true });
      setCouponResult(r.data);
      localStorage.setItem("sf_coupon", r.data.code);
      toast.success(`Cupom ${r.data.code} validado!`);
    } catch (err) {
      setCouponError(err.response?.data?.detail || "Cupom inválido");
      localStorage.removeItem("sf_coupon");
    }
  };

  useEffect(() => {
    axios.get(`${API}/products`).then((r) => setProducts(r.data));
    axios.get(`${API}/settings`).then((r) => setSettings(r.data));
  }, []);

  useEffect(() => {
    if (location.hash && !location.hash.includes("session_id")) {
      setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ behavior: "smooth" }), 200);
    }
  }, [location.hash]);

  useEffect(() => {
    if (user) {
      axios.get(`${API}/loyalty/me`, { withCredentials: true }).then((r) => setLoyalty(r.data)).catch(() => {});
    } else {
      setLoyalty(null);
    }
  }, [user]);

  const waNumber = settings?.whatsapp_number || "5583999170131";
  const waLink = (text) => `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
  const waGeneric = waLink("Olá! Vim pelo site da Santa Fé Distribuidora e gostaria de fazer um pedido.");

  return (
    <div className="pb-0">
      {settings && !settings.store_open && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-3" data-testid="store-closed-banner">
          <p className="max-w-6xl mx-auto text-sm text-amber-800 flex items-center gap-2">
            <Clock className="w-4 h-4 shrink-0" />
            <span><strong>Estamos fechados agora.</strong> Você pode enviar seu pedido e ele será atendido na abertura (todos os dias às {settings.hours_weekday_open}).</span>
          </p>
        </div>
      )}

      {settings?.closing_soon && (
        <div className="bg-orange-50 border-b border-orange-200 px-5 py-3" data-testid="closing-soon-banner">
          <p className="max-w-6xl mx-auto text-sm text-orange-800 font-semibold flex items-center justify-center gap-2">
            <Clock className="w-4 h-4 shrink-0" /> Fechamos em {settings.minutes_to_close} minutos — envie seu pedido agora!
          </p>
        </div>
      )}

      {/* HERO */}
      <section id="inicio" className="bg-[#0c2d48] text-white relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-secondary/15 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full bg-primary/25 blur-3xl" />
        <div className="max-w-6xl mx-auto px-5 py-14 md:py-20 grid md:grid-cols-2 gap-10 items-center relative">
          <div className="fade-up text-center md:mx-auto">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest bg-white/10 border border-white/15 rounded-full px-4 py-2">
              <Zap className="w-3.5 h-3.5 text-secondary" /> Santa Fé Distribuidora
            </span>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.05] mt-5" style={{ fontFamily: "Manrope" }}>
              Gás e água<br /><span className="text-secondary">na sua casa!</span>
            </h1>
            <p className="text-white/80 mt-4 text-base md:text-lg">
              Entrega rápida e atendimento de confiança em <strong className="text-white">João Pessoa</strong>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-6 text-sm justify-items-center sm:justify-items-start max-w-md mx-auto">
              <div className="flex items-center gap-2 text-white/85"><Truck className="w-4 h-4 text-secondary shrink-0" /> Entrega grátis e rápida</div>
              <div className="flex items-center gap-2 text-white/85"><ShieldCheck className="w-4 h-4 text-secondary shrink-0" /> Produtos de qualidade</div>
              <div className="flex items-center gap-2 text-white/85"><Clock className="w-4 h-4 text-secondary shrink-0" /> Todos os dias, das 7h às 19h</div>
              <div className="flex items-center gap-2 text-white/85"><CreditCard className="w-4 h-4 text-secondary shrink-0" /> Pix, cartão e dinheiro</div>
            </div>
            <div className="flex flex-wrap gap-3 mt-8 justify-center">
              <button onClick={() => document.querySelector("#produtos")?.scrollIntoView({ behavior: "smooth" })}
                data-testid="hero-order-button"
                className="h-14 px-8 rounded-full bg-secondary text-white text-lg font-bold shadow-lg shadow-secondary/30 hover:bg-secondary/90 active:scale-[0.98] transition-colors transition-transform">
                Fazer meu pedido
              </button>
              <a href={waGeneric} target="_blank" rel="noopener noreferrer" data-testid="hero-whatsapp-link"
                className="h-14 px-6 rounded-full border-2 border-white/25 text-white text-lg font-bold flex items-center gap-2 hover:bg-white/10 transition-colors">
                <MessageCircle className="w-5 h-5" /> WhatsApp
              </a>
            </div>
          </div>
          <div className="hidden md:flex items-center justify-center relative fade-up" style={{ animationDelay: "150ms" }}>
            <div className="hero-cylinder">
              <div className="hero-cylinder-label">P13</div>
            </div>
            <div className="absolute top-6 right-8 bg-white text-[#0c2d48] rounded-2xl px-4 py-3 shadow-xl flex items-center gap-2 rotate-3">
              <Truck className="w-5 h-5 text-secondary" />
              <div className="leading-tight text-xs font-bold uppercase">Entrega<br /><span className="text-sm">Rápida</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ENTREGA GRÁTIS */}
      <div className="bg-secondary text-white" data-testid="free-delivery-strip">
        <div className="max-w-6xl mx-auto px-5 py-4 text-center">
          <p className="font-extrabold text-sm sm:text-base tracking-wide uppercase" style={{ fontFamily: "Manrope" }}>
            🚚 Entrega grátis* &nbsp;·&nbsp; 🔧 Instalação grátis &nbsp;·&nbsp; 🎟️ Cupons grátis
          </p>
          <p className="text-[11px] text-white/80 mt-0.5">*exceto Gás do Povo, que tem entrega cobrada</p>
        </div>
      </div>

      {/* GÁS DO POVO */}
      <section id="gasdopovo" className="max-w-6xl mx-auto px-5 pt-10">
        <div className="rounded-3xl bg-gradient-to-r from-amber-400 to-orange-500 text-white p-6 md:p-8 shadow-lg" data-testid="gdp-section">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest bg-white/20 rounded-full px-4 py-1.5">
              <Flame className="w-3.5 h-3.5" /> Gás do Povo
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-3" style={{ fontFamily: "Manrope" }}>Somos revenda credenciada do Gás do Povo</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mt-6">
            <div>
              <button onClick={() => setGdpOpen(gdpOpen === 1 ? 0 : 1)} data-testid="gdp-faq-1"
                className="w-full h-12 rounded-full bg-white/15 border border-white/25 text-sm font-bold hover:bg-white/25 transition-colors">
                O que é o Gás do Povo?
              </button>
              {gdpOpen === 1 && <p className="text-sm bg-white/10 rounded-2xl p-4 mt-2" data-testid="gdp-faq-1-text">É um programa do Governo Federal que permite a famílias elegíveis receberem gratuitamente a recarga de um botijão de GLP de 13 kg em revendas credenciadas.</p>}
            </div>
            <div>
              <button onClick={() => setGdpOpen(gdpOpen === 2 ? 0 : 2)} data-testid="gdp-faq-2"
                className="w-full h-12 rounded-full bg-white/15 border border-white/25 text-sm font-bold hover:bg-white/25 transition-colors">
                Quem pode receber?
              </button>
              {gdpOpen === 2 && (
                <div className="text-sm bg-white/10 rounded-2xl p-4 mt-2 text-left space-y-1" data-testid="gdp-faq-2-text">
                  <p>• Cadastro Único atualizado nos últimos 24 meses;</p>
                  <p>• renda familiar de até meio salário-mínimo por pessoa;</p>
                  <p>• CPF do responsável familiar regular;</p>
                  <p>• cadastro sem determinadas pendências;</p>
                  <p>• atualmente, o programa prioriza famílias do Bolsa Família com 2 ou mais integrantes.</p>
                  <p className="font-bold mt-2">⚠️ A participação não é solicitada diretamente à Santa Fé. A seleção é feita pelo Governo com base nos dados do Cadastro Único.</p>
                </div>
              )}
            </div>
            <a href="https://gasdopovo.mds.gov.br" target="_blank" rel="noopener noreferrer" data-testid="gdp-consult-link"
              className="w-full h-12 rounded-full bg-white text-orange-600 text-sm font-bold flex items-center justify-center hover:bg-orange-50 transition-colors">
              Consulte seu benefício
            </a>
          </div>
          <div className="text-center mt-5">
            <button onClick={goToGdp} data-testid="gdp-order-button"
              className="h-13 px-8 py-3 rounded-full bg-[#0c2d48] text-white font-bold hover:bg-[#0c2d48]/85 active:scale-[0.98] transition-colors transition-transform">
              Já tenho o benefício, quero solicitar →
            </button>
          </div>
        </div>
      </section>

      {/* LOYALTY */}
      {loyalty && (
        <div className="max-w-6xl mx-auto px-5 mt-8">
          <div className="rounded-2xl bg-primary text-white p-5 shadow-lg fade-up" data-testid="loyalty-card">
            <div className="flex items-center justify-between">
              <p className="font-bold flex items-center gap-2" style={{ fontFamily: "Manrope" }}>
                <Gift className="w-5 h-5" />
                {loyalty.next_is_discount ? "Você ganhou um cupom grátis! Veja em Meus Pedidos" : "Cartão fidelidade"}
              </p>
              <span className="text-sm font-semibold" data-testid="loyalty-progress-text">{loyalty.cycle_progress}/3</span>
            </div>
            <div className="mt-3 h-2.5 bg-white/25 rounded-full overflow-hidden">
              <div className="h-full bg-secondary rounded-full transition-[width] duration-500" style={{ width: `${Math.min(loyalty.cycle_progress, 3) * 33.34}%` }} />
            </div>
            {!loyalty.next_is_discount && (
              <p className="text-xs text-white/80 mt-2">Faltam {loyalty.remaining} pedidos para ganhar um cupom grátis</p>
            )}
          </div>
        </div>
      )}

      {/* CUPOM */}
      <section id="cupom" className="max-w-6xl mx-auto px-5 pt-10">
        <div className="max-w-xl mx-auto rounded-3xl bg-white border border-border shadow-sm p-6 md:p-8 text-center" data-testid="coupon-box">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
            <Ticket className="w-4 h-4" /> Tem um cupom?
          </span>
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight mt-2" style={{ fontFamily: "Manrope" }}>Valide seu cupom de desconto</h2>
          <p className="text-sm text-muted-foreground mt-1">Ele será aplicado automaticamente no seu próximo pedido.</p>
          <div className="flex gap-2 mt-5 max-w-sm mx-auto">
            <input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} data-testid="home-coupon-input"
              className="flex-1 h-14 rounded-xl border border-input px-4 text-base bg-white focus:outline-none focus:ring-2 focus:ring-ring uppercase" placeholder="Ex: BEMVINDO" />
            <button onClick={checkCoupon} data-testid="home-coupon-apply"
              className="h-14 px-6 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors">
              Validar
            </button>
          </div>
          {couponResult && (
            <p className="text-sm font-bold text-green-700 mt-3" data-testid="home-coupon-valid">
              ✅ Cupom {couponResult.code} válido: {couponResult.type === "percent" ? `${couponResult.value}%` : brl(couponResult.value)} de desconto — já ficará aplicado no seu pedido!
            </p>
          )}
          {couponError && <p className="text-sm font-semibold text-red-600 mt-3" data-testid="home-coupon-error">{couponError}</p>}
        </div>
      </section>

      {/* PRODUTOS */}
      <section id="produtos" className="max-w-6xl mx-auto px-5 py-12">
        <div className="max-w-xl mx-auto text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-secondary">Nossos produtos</span>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-2" style={{ fontFamily: "Manrope" }}>Escolha o que você precisa</h2>
          <p className="text-muted-foreground mt-2">Produtos de qualidade e preços claros. Clique em pedir e fale direto com a Santa Fé.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 mt-8 max-w-4xl mx-auto">
          {products.map((p, i) => {
            const isGdp = p.name.toLowerCase().includes("gás do povo") || p.name.toLowerCase().includes("gas do povo");
            return (
            <article key={p.id} data-product={isGdp ? "gasdopovo" : ""} className={`bg-white rounded-3xl border shadow-sm overflow-hidden fade-up flex flex-col transition-shadow ${isGdp && highlightGdp ? "ring-4 ring-secondary border-secondary" : "border-border"}`} style={{ animationDelay: `${i * 90}ms` }} data-testid={`product-card-${i}`}>
              {p.image_url ? (
                <div className="w-full h-[190px] bg-white flex items-center justify-center p-3 border-b border-border">
                  <img src={p.image_url} alt={p.name} className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <ProductVisual visual={p.visual} name={p.name} />
              )}
              <div className="p-6 flex flex-col flex-1">
                {p.tag && (
                  <span className={`self-start text-xs font-bold px-3 py-1 rounded-full ${p.tag === "Mais pedido" ? "bg-orange-100 text-orange-700" : "bg-accent text-accent-foreground"}`}>
                    {p.tag}
                  </span>
                )}
                <h3 className="font-bold text-xl tracking-tight mt-2" style={{ fontFamily: "Manrope" }}>{p.name}</h3>
                {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                {isGdp ? (
                  <>
                    <p className="text-xs text-muted-foreground mt-3 uppercase tracking-wide font-semibold">Taxa de entrega</p>
                    <p className="text-3xl font-extrabold text-primary" data-testid={`product-price-${i}`} style={{ fontFamily: "Manrope" }}>{brl(p.price)}</p>
                    <p className="text-sm font-bold text-green-700 mt-0.5">1ª compra: cupom automático de R$ 10 (entrega por R$ 10)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Recarga gratuita pelo benefício do Governo · sujeito a validação do CPF</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mt-3 uppercase tracking-wide font-semibold">À vista</p>
                    <p className="text-3xl font-extrabold text-primary" data-testid={`product-price-${i}`} style={{ fontFamily: "Manrope" }}>{brl(p.price)}</p>
                    {p.card_price && <p className="text-sm text-muted-foreground mt-0.5">{brl(p.card_price)} no cartão</p>}
                  </>
                )}
                <button
                  onClick={() => navigate(`/pedido/${p.id}`)}
                  data-testid={`order-button-${i}`}
                  className="mt-5 w-full h-14 rounded-full bg-secondary text-white text-lg font-bold shadow-md hover:bg-secondary/90 active:scale-[0.98] transition-colors transition-transform flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-5 h-5" /> Pedir agora
                </button>
              </div>
            </article>
            );
          })}
        </div>
      </section>

      {/* SOBRE */}
      <section id="sobre" className="bg-white border-y border-border">
        <div className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div className="rounded-3xl overflow-hidden border border-border shadow-sm relative min-h-[260px]">
            <img src="/images/deposito.jpeg" alt="Fachada da Santa Fé Distribuidora" className="w-full h-full min-h-[260px] object-cover" data-testid="about-depot-photo" />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-5 flex items-end justify-between gap-3">
              <p className="text-sm text-white font-semibold flex items-center gap-1.5"><MapPin className="w-4 h-4 text-secondary" /> Cidade Verde · João Pessoa</p>
              <img src="/images/logo-mark.png" alt="Logo Santa Fé" className="w-12 h-12 rounded-full border-2 border-white/60" />
            </div>
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-secondary">Conheça a Santa Fé</span>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-2" style={{ fontFamily: "Manrope" }}>Gás e água mineral com atendimento de confiança.</h2>
            <p className="text-muted-foreground mt-3">A Santa Fé Distribuidora atende você em João Pessoa com gás e água mineral, buscando tornar seu pedido simples, rápido e seguro.</p>
            <div className="space-y-4 mt-6">
              {[
                { icon: Truck, title: "Entrega rápida", desc: "Levamos até você com agilidade." },
                { icon: ShieldCheck, title: "Qualidade", desc: "Produtos para o seu dia a dia." },
                { icon: Clock, title: "Todos os dias", desc: "Das 7h às 19h." },
              ].map((it) => (
                <div key={it.title} className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
                    <it.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold">{it.title}</p>
                    <p className="text-sm text-muted-foreground">{it.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CONTATO */}
      <section id="contato" className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-10">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-secondary">Fale com a gente</span>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-2" style={{ fontFamily: "Manrope" }}>Precisou de gás ou água?</h2>
          <p className="text-muted-foreground mt-2">Faça seu pedido pelo site ou chame direto no WhatsApp.</p>
          <a href={waGeneric} target="_blank" rel="noopener noreferrer" data-testid="contact-whatsapp-button"
            className="mt-6 inline-flex h-14 px-8 rounded-full bg-[#25D366] text-white text-lg font-bold items-center gap-2 hover:bg-[#20bd5a] active:scale-[0.98] transition-colors transition-transform">
            <MessageCircle className="w-5 h-5" /> Chamar no WhatsApp
          </a>
          <div className="space-y-4 mt-8 text-sm">
            <div className="flex items-start gap-3"><MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" /><span><strong>Endereço</strong><br />{ADDRESS}</span></div>
            <div className="flex items-start gap-3"><Clock className="w-5 h-5 text-primary shrink-0 mt-0.5" /><span><strong>Horário</strong><br />Todos os dias, das 7h às 19h</span></div>
            <div className="flex items-start gap-3"><Instagram className="w-5 h-5 text-primary shrink-0 mt-0.5" /><span><strong>Instagram</strong><br /><a href="https://www.instagram.com/_santafedistribuidora/" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline" data-testid="instagram-link">@_SANTAFEDISTRIBUIDORA</a></span></div>
            <div className="flex items-start gap-3"><Phone className="w-5 h-5 text-primary shrink-0 mt-0.5" /><span><strong>Telefone</strong><br /><a href={`tel:+${waNumber}`} className="text-primary font-semibold hover:underline" data-testid="phone-link">(83) 99917-0131</a></span></div>
          </div>
        </div>
        <div className="rounded-3xl overflow-hidden border border-border shadow-sm min-h-[320px]">
          <iframe
            title="Mapa da Santa Fé Distribuidora"
            src={`https://www.google.com/maps?q=${encodeURIComponent(ADDRESS)}&output=embed`}
            loading="lazy"
            className="w-full h-full min-h-[320px] border-0"
            data-testid="map-iframe"
          />
        </div>
      </section>

      {/* LOGIN INCENTIVO */}
      {!user && (
        <div className="max-w-6xl mx-auto px-5 pb-16">
          <div className="rounded-2xl border border-dashed border-primary/40 bg-accent/50 p-6 text-center fade-up">
            <p className="text-sm text-foreground font-medium">Crie sua conta para ganhar pontos de fidelidade e salvar seu endereço — a cada 5 pedidos, o 6º tem R$ 10 de desconto!</p>
            <button onClick={login} data-testid="home-login-button" className="mt-3 h-12 px-6 rounded-full bg-primary text-white font-semibold hover:bg-primary/90 active:scale-[0.98] transition-colors transition-transform">
              Entrar com Google
            </button>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="bg-[#0c2d48] text-white">
        <div className="max-w-6xl mx-auto px-5 py-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2">
              <img src="/images/logo-mark.png" alt="Santa Fé Distribuidora" className="w-10 h-10 rounded-full object-cover" />
              <span className="font-bold text-lg" style={{ fontFamily: "Manrope" }}>Santa Fé Distribuidora</span>
            </div>
            <p className="text-sm text-white/70 mt-3">Gás e água mineral com qualidade, preço justo e atendimento de confiança em João Pessoa.</p>
          </div>
          <div>
            <h3 className="font-bold mb-3" style={{ fontFamily: "Manrope" }}>Contato</h3>
            <a href={waGeneric} target="_blank" rel="noopener noreferrer" className="text-sm text-white/70 hover:text-white block transition-colors" data-testid="footer-whatsapp-link">(83) 99917-0131</a>
            <p className="text-sm text-white/70 mt-1">Todos os dias · 7h às 19h</p>
          </div>
          <div>
            <h3 className="font-bold mb-3" style={{ fontFamily: "Manrope" }}>Navegação</h3>
            {["inicio", "gasdopovo", "produtos", "sobre", "contato"].map((s) => (
              <button key={s} onClick={() => document.querySelector(`#${s}`)?.scrollIntoView({ behavior: "smooth" })}
                className="text-sm text-white/70 hover:text-white block capitalize transition-colors" data-testid={`footer-nav-${s}`}>
                {s === "inicio" ? "Início" : s === "gasdopovo" ? "Gás do Povo" : s}
              </button>
            ))}
          </div>
          <div>
            <h3 className="font-bold mb-3" style={{ fontFamily: "Manrope" }}>Onde estamos</h3>
            <p className="text-sm text-white/70">{ADDRESS}</p>
            <a href="https://www.instagram.com/_santafedistribuidora/" target="_blank" rel="noopener noreferrer" className="text-sm text-white/70 hover:text-white mt-2 inline-flex items-center gap-1.5 transition-colors" data-testid="footer-instagram-link">
              <Instagram className="w-4 h-4" /> Instagram
            </a>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-5 py-4 flex flex-col sm:flex-row justify-between gap-2 text-xs text-white/50">
            <span>© 2026 Santa Fé Distribuidora. Todos os direitos reservados.</span>
            <span>Feito para facilitar seu pedido.</span>
          </div>
        </div>
      </footer>

      {/* FLOATING WHATSAPP */}
      <a href={waGeneric} target="_blank" rel="noopener noreferrer" data-testid="floating-whatsapp-button"
        className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-xl hover:bg-[#20bd5a] active:scale-[0.95] transition-colors transition-transform">
        <MessageCircle className="w-7 h-7" />
      </a>
    </div>
  );
}
