export type Veredito = "verdadeiro" | "parcial" | "enganoso" | "falso" | "sem_fonte" | "nao_checavel";

export const VEREDITOS_CHECAVEIS: Veredito[] = ["verdadeiro", "parcial", "enganoso", "falso", "sem_fonte"];

export interface Definicao {
  rotulo: string;
  emoji: string;
  definicao: string;
}

export interface FonteRel {
  titulo: string;
  url: string;
  tipo: "primaria" | "checagem" | "imprensa" | "academica" | string;
  trecho?: string;
  alegacoes?: number[];
}

export interface AlegacaoRel {
  id: number;
  t_ini: number;
  t_fim: number;
  citacao: string;
  tipo: string;
  checavel: boolean;
  o_que_checar: string;
  importancia: number;
  veredito: Veredito | null;
  status: "verificada" | "nao_verificada" | "nao_checavel";
  confianca: number | null;
  confianca_rotulo: string;
  explicacao: string;
  o_que_e_verdade_por_tras: string;
  fontes: FonteRel[];
  nota?: string;
  do_cache?: boolean;
}

export interface Trecho {
  t_ini: number;
  t_fim: number;
  origem: "fala" | "legenda" | "tela";
  texto: string;
  legenda: string | null;
  legenda_confere: boolean | null;
  divergencia: boolean;
  confianca: number | null;
}

export interface Estatisticas {
  total: number;
  checaveis: number;
  nao_checaveis: number;
  nao_verificadas: number;
  por_veredito: Record<Veredito, number>;
  porcentagens: Record<string, number>;
  pct_errado_ou_distorcido: number;
  frase: string;
}

export interface Relatorio {
  simulado: boolean;
  titulo: string;
  checado_em: string;
  video: { duracao: number; largura: number; altura: number; tem_audio: boolean };
  autor_ou_conta: string;
  descricao_video: string;
  tese_central: string;
  resumo: string[];
  alegacoes: AlegacaoRel[];
  acertos: string[];
  estatisticas: Estatisticas;
  padrao_desinformacao: string;
  limitacoes: string[];
  transcricao: Trecho[];
  fontes_consolidadas: FonteRel[];
  audio: { situacao: string; modelo: string; detalhe: string };
  ocr: { modo: string };
  custo: { total_usd: number };
}

export interface Checagem {
  id: string;
  status: "fila" | "processando" | "concluida" | "erro" | "rejeitada";
  etapa: string;
  etapa_detalhe: string;
  progresso_atual: number;
  progresso_total: number;
  n_alegacoes: number;
  erro_msg: string;
  titulo: string;
  criado_em: string;
  iniciado_em: string | null;
  concluido_em: string | null;
  agora: string;
  etapas: { codigo: string; nome: string }[];
  video: { duracao: number; largura: number; altura: number } | null;
  url: string;
  definicoes: Record<Veredito, Definicao>;
  tipos: Record<string, string>;
  aviso: string;
  relatorio: Relatorio | null;
}

export interface ItemHistorico {
  id: string;
  titulo: string;
  status: Checagem["status"];
  criado_em: string;
  simulado: boolean;
  duracao: number | null;
  estatisticas: Estatisticas | null;
}
