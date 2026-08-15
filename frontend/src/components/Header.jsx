import { Link } from "react-router-dom";
import { Flame, LogOut, User, ClipboardList, Shield } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export const Header = () => {
  const { user, login, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-border shadow-sm">
      <div className="max-w-md mx-auto flex items-center justify-between px-5 h-16">
        <Link to="/" className="flex items-center gap-2" data-testid="header-logo-link">
          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
            <Flame className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <span className="font-bold text-lg tracking-tight text-primary block" style={{ fontFamily: "Manrope" }}>Santa Fe</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Depósito de Gás</span>
          </div>
        </Link>
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
    </header>
  );
};
