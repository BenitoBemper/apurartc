"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { definirCompetencia, definirEmpresa, sair } from "@/app/(app)/acoes";
import type { EmpresaResumo } from "@/lib/contexto";
import { formatarCnpj } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MENU = [
  { href: "/painel", rotulo: "Painel" },
  { href: "/importar", rotulo: "Importar" },
  { href: "/divergencias", rotulo: "Divergências" },
  { href: "/relatorio", rotulo: "Relatório" },
  { href: "/empresas", rotulo: "Empresas" },
];

const PAPEIS = { admin: "Administrador", operador: "Operador", leitor: "Leitor" } as const;

type Props = {
  escritorio: string;
  email: string;
  papel: keyof typeof PAPEIS;
  empresas: EmpresaResumo[];
  empresaId: string | null;
  competencia: string;
};

export function Topo({ escritorio, email, papel, empresas, empresaId, competencia }: Props) {
  const caminho = usePathname();
  const { setTheme } = useTheme();
  const [pendente, iniciar] = useTransition();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/painel" className="font-semibold">ApuraRTC</Link>
        <nav className="flex gap-1">
          {MENU.map((m) => (
            <Link key={m.href} href={m.href}
              className={cn("rounded-md px-3 py-1.5 text-sm hover:bg-muted",
                caminho.startsWith(m.href) && "bg-muted font-medium")}>
              {m.rotulo}
            </Link>
          ))}
        </nav>

        <div className={cn("ml-auto flex flex-wrap items-center gap-2", pendente && "opacity-60")}>
          <Select value={empresaId ?? undefined} disabled={!empresas.length}
            onValueChange={(v) => iniciar(() => definirEmpresa(v))}>
            <SelectTrigger className="w-64" aria-label="Empresa">
              <SelectValue placeholder="Nenhuma empresa cadastrada" />
            </SelectTrigger>
            <SelectContent>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  <span className="truncate">{e.razao_social}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{formatarCnpj(e.cnpj)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="month" aria-label="Competência" className="w-40" value={competencia}
            onChange={(e) => e.target.value && iniciar(() => definirCompetencia(e.target.value))} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Usuário"><UserRound /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <div className="truncate text-sm font-medium">{email}</div>
                <div className="truncate text-xs text-muted-foreground">{escritorio} · {PAPEIS[papel]}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTheme("light")}><Sun /> Tema claro</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}><Moon /> Tema escuro</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}><Monitor /> Tema do sistema</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => iniciar(() => sair())}><LogOut /> Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
