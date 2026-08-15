import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Clock, MapPin, Gift, Truck } from "lucide-react";
import { API, useAuth } from "../context/AuthContext";

const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Home() {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loyalty, setLoyalty] = useState(null);
  const navigate = useNavigate();
  const { user, login } = useAuth();

  useEffect(() => {
    axios.get(`${API}/products`).then((r) => setProducts(r.data));
    axios.get(`${API}/settings`).then((r) => setSettings(r.data));
  }, []);

  useEffect(() => {
    if (user) {
      axios.get(`${API}/loyalty/me`, { withCredentials: true }).then((r) => setLoyalty(r.data)).catch(() => {});
    } else {
      setLoyalty(null);
    }
  }, [user]);

  return (
    <div className="max-w-md mx-auto px-5 pb-24">
      {settings && !settings.store_open && (
        <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3 fade-up" data-testid="store-closed-banner">
          <Clock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>Estamos fechados agora.</strong> Você pode enviar seu pedido e ele será atendido na abertura ({settings.hours_weekday_open} seg–sáb, {settings.hours_sunday_open} dom).
          </p>
        </div>
      )}

      <section className="mt-6 fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight leading-tight" style={{ fontFamily: "Manrope" }}>
          Gás e água <span className="text-primary">na sua porta</span>
        </h1>
        <p className="text-muted-foreground mt-2 text-base">Entrega rápida em João Pessoa. Peça pelo WhatsApp em menos de 1 minuto.</p>
        <div className="flex gap-2 mt-4">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-accent text-accent-foreground rounded-full px-3 py-1.5">
            <Truck className="w-3.5 h-3.5" /> Entrega grátis
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-orange-100 text-orange-700 rounded-full px-3 py-1.5">
            <Gift className="w-3.5 h-3.5" /> 10 pedidos = desconto no 11º
          </span>
        </div>
      </section>

      {loyalty && (
        <div className="mt-6 rounded-2xl bg-primary text-white p-5 fade-up" data-testid="loyalty-card">
          <div className="flex items-center justify-between">
            <p className="font-bold" style={{ fontFamily: "Manrope" }}>
              {loyalty.next_is_discount ? "🎁 Seu próximo pedido tem desconto!" : "Cartão fidelidade"}
            </p>
            <span className="text-sm font-semibold" data-testid="loyalty-progress-text">{loyalty.cycle_progress}/10</span>
          </div>
          <div className="mt-3 h-2.5 bg-white/25 rounded-full overflow-hidden">
            <div className="h-full bg-secondary rounded-full transition-[width] duration-500" style={{ width: `${Math.min(loyalty.cycle_progress, 10) * 10}%` }} />
          </div>
          {!loyalty.next_is_discount && (
            <p className="text-xs text-white/80 mt-2">Faltam {loyalty.remaining} pedidos para seu desconto de fidelidade</p>
          )}
        </div>
      )}

      <section className="mt-8 space-y-5">
        <h2 className="text-lg font-bold tracking-tight" style={{ fontFamily: "Manrope" }}>Nossos produtos</h2>
        {products.map((p, i) => (
          <div key={p.id} className="bg-white rounded-3xl border border-border shadow-sm overflow-hidden fade-up" style={{ animationDelay: `${i * 90}ms` }} data-testid={`product-card-${i}`}>
            <img src={p.image_url} alt={p.name} className="w-full h-44 object-cover" />
            <div className="p-6">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 className="font-bold text-xl tracking-tight" style={{ fontFamily: "Manrope" }}>{p.name}</h3>
                  <p className="text-2xl font-extrabold text-primary mt-1" data-testid={`product-price-${i}`}>{brl(p.price)}</p>
                </div>
                <button
                  onClick={() => navigate(`/pedido/${p.id}`)}
                  data-testid={`order-button-${i}`}
                  className="h-14 px-8 rounded-full bg-secondary text-white text-lg font-bold shadow-md hover:bg-secondary/90 active:scale-[0.98] transition-colors transition-transform shrink-0"
                >
                  Pedir
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {!user && (
        <div className="mt-8 rounded-2xl border border-dashed border-primary/40 bg-accent/50 p-5 text-center fade-up">
          <p className="text-sm text-foreground font-medium">Entre com Google para ganhar pontos de fidelidade e salvar seu endereço</p>
          <button onClick={login} data-testid="home-login-button" className="mt-3 h-12 px-6 rounded-full bg-primary text-white font-semibold hover:bg-primary/90 active:scale-[0.98] transition-colors transition-transform">
            Entrar com Google
          </button>
        </div>
      )}

      <footer className="mt-10 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5 pb-4">
        <MapPin className="w-3.5 h-3.5" /> Entregamos somente em João Pessoa - PB
      </footer>
    </div>
  );
}
