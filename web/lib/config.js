// Projeto do Supabase usado para a família conectada e as notificações.
// Estes dois valores são públicos por natureza (ficam no app de qualquer jeito): quem protege os dados
// são as regras de acesso do banco, em supabase/schema.sql. A chave secreta do projeto nunca vai aqui.
export const SUPABASE_URL = "https://ihdoiweremclneacfupd.supabase.co";
export const SUPABASE_KEY = "sb_publishable_2oq-aNHwwkFBLQrefctULw_v_Pvl2hK";

// Quem responde pelo app (aparece na política de privacidade e na página "Anuncie aqui").
// Deixe vazio o que não quiser mostrar; sem contato, o app usa só o formulário.
export const OWNER = {
  name: "",
  email: "",
  whatsapp: "", // só números, com DDD e código do país (ex.: 5551999999999)
};
