import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Gift, PackageOpen } from "lucide-react";
import { API, useAuth } from "../context/AuthContext";

const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const STATUS_LABELS = { enviado: "Enviado", em_entrega: "Em entrega", entregue: "Entregue", cancelado: "Cancelado" };
const STATUS_COLORS = {
  enviado: "bg-blue-100 text-blue-700",
  em_entrega: "bg-amber-100 text-amber-700",
  entregue: "bg-green-100 text-green-700",
  cancelado: "bg-red-100 text-red-700",
};

export default function MyOrders() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState(null);
  const [loyalty, setLoyalty] = useState(null);

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) {
      axios.get(`${API}/orders/my`, { withCredentials: true }).then((r) => setOrders(r.data));
      axios.get(`${API}/loyalty/me`, { withCredentials: true }).then((r) => setLoyalty(r.data));
    }
  }, [user]);

  if (loading || !user) return null;

  return (
    <div className="max-w-md mx-auto px-5 pb-16">
      <h1 className="text-2xl font-extrabold tracking-tight mt-6" style={{ fontFamily: "Manrope" }}>Meus pedidos</h1>

      {loyalty && (
        <div className="mt-4 rounded-2xl bg-primary text-white p-5" data-testid="loyalty-stamp-card">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5" />
            <p className="font-bold" style={{ fontFamily: "Manrope" }}>Cartão fidelidade</p>
          </div>
          <div className="grid grid-cols-5 gap-2 mt-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} data-testid={`stamp-${i}`}
                className={`aspect-square rounded-full flex items-center justify-center text-sm font-bold ${i < loyalty.cycle_progress ? "bg-secondary text-white" : "bg-white/20 text-white/50"}`}>
                {i + 1}
              </div>
            ))}
          </div>
          <p className="text-sm text-white/85 mt-3">
            {loyalty.next_is_discount
              ? "🎁 Seu próximo pedido tem desconto de fidelidade!"
              : `Faltam ${loyalty.remaining} pedidos para o desconto no 11º`}
          </p>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {orders === null ? (
          <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground" data-testid="no-orders-message">
            <PackageOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Você ainda não fez nenhum pedido.</p>
          </div>
        ) : (
          orders.map((o, i) => (
            <div key={o.id} className="bg-white rounded-2xl border border-border shadow-sm p-5 fade-up" style={{ animationDelay: `${i * 60}ms` }} data-testid={`order-item-${i}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold">{o.items.map((it) => `${it.qty}x ${it.name}`).join(", ")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(o.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${STATUS_COLORS[o.status] || "bg-muted text-muted-foreground"}`}>
                  {STATUS_LABELS[o.status] || o.status}
                </span>
              </div>
              <div className="flex justify-between items-center mt-3">
                <p className="text-sm text-muted-foreground">{o.payment_method}</p>
                <p className="font-extrabold text-primary" style={{ fontFamily: "Manrope" }}>{brl(o.total)}</p>
              </div>
              {o.loyalty_discount && (
                <p className="text-xs font-bold text-orange-600 mt-2">🎁 Pedido com desconto de fidelidade</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
