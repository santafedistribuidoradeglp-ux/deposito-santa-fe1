import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogOut, User, ClipboardList, Shield, MessageCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const NAV = [
  { label: "Início", hash: "#inicio" },
  { label: "Produtos", hash: "#produtos" },
  { label: "Promoções", hash: "#promocoes" },
  { label: "Sobre", hash: "#sobre" },
  { label: "Contato", hash: "#contato" },
];

export const Header = () => {
  const { user, login, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const goTo = (hash) => {
    if (location.pathname !== "/") {
      navigate("/" + hash);
    } else {
      document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-border shadow-sm">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-5 h-16 gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0" data-testid="header-logo-link">
          <img src="/images/logo-mark.png" alt="Santa Fé Distribuidora" className="w-10 h-10 rounded-full object-cover border border-border" />
          <div className="leading-tight">
            <span className="font-bold text-lg tracking-tight text-primary block" style={{ fontFamily: "Manrope" }}>Santa Fé</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Distribuidora</span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          {NAV.map((n) => (
            <button key={n.hash} onClick={() => goTo(n.hash)} data-testid={`nav-${n.hash.slice(1)}`}
              className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">
              {n.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a href="https://wa.me/5583999170131" target="_blank" rel="noopener noreferrer" data-testid="header-whatsapp-link"
            className="hidden sm:flex items-center gap-1.5 h-10 px-4 rounded-full border border-[#25D366] text-[#128C7E] text-sm font-bold hover:bg-green-50 transition-colors">
            <MessageCircle className="w-4 h-4" /> (83) 99917-0131
          </a>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full border border-border p-1 pr-3 hover:bg-muted transition-colors" data-testid="user-menu-trigger">
                  {user.picture ? (
                    <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center"><User className="w-4 h-4 text-primary" /></div>
                  )}
                  <span className="text-sm font-medium max-w-[80px] truncate">{user.name.split(" ")[0]}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuItem asChild data-testid="menu-my-orders">
                  <Link to="/meus-pedidos"><ClipboardList className="w-4 h-4 mr-2" />Meus pedidos</Link>
                </DropdownMenuItem>
                {user.role === "admin" && (
                  <DropdownMenuItem asChild data-testid="menu-admin">
                    <Link to="/admin"><Shield className="w-4 h-4 mr-2" />Painel Admin</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={logout} data-testid="menu-logout">
                  <LogOut className="w-4 h-4 mr-2" />Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              onClick={login}
              data-testid="login-button"
              className="h-10 px-4 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-colors transition-transform"
            >
              Entrar
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
