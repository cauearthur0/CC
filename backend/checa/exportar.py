"""Exportações: card-imagem para redes (1080×1350) e PDF."""

from __future__ import annotations

import io

from PIL import Image, ImageDraw, ImageFont

from .config import config
from .llm.esquemas import VEREDITOS_CHECAVEIS
from .relatorio import AVISO, TIPOS_ALEGACAO, VEREDITOS, importantes, rotulo_confianca
from .texto import hms

CORES = {
    "verdadeiro": (26, 127, 55),
    "parcial": (191, 135, 0),
    "enganoso": (219, 109, 40),
    "falso": (207, 34, 46),
    "sem_fonte": (101, 109, 118),
    "nao_checavel": (140, 149, 159),
}
SIMBOLO = {"verdadeiro": "✓", "parcial": "≈", "enganoso": "!", "falso": "✕", "sem_fonte": "?", "nao_checavel": "–"}
TINTA = (31, 35, 40)
SUAVE = (87, 96, 106)
FUNDO = (250, 248, 244)


def _fonte(tamanho: int, negrito: bool = False) -> ImageFont.FreeTypeFont:
    c = config()
    try:
        return ImageFont.truetype(c.fonte_ttf_negrito if negrito else c.fonte_ttf, tamanho)
    except OSError:
        return ImageFont.load_default(tamanho)


def _quebrar(d: ImageDraw.ImageDraw, texto: str, fonte, largura: int, max_linhas: int) -> list[str]:
    palavras, linhas, atual = texto.split(), [], ""
    for p in palavras:
        teste = f"{atual} {p}".strip()
        if d.textlength(teste, font=fonte) <= largura:
            atual = teste
        else:
            if atual:
                linhas.append(atual)
            atual = p
    if atual:
        linhas.append(atual)
    if len(linhas) > max_linhas:
        linhas = linhas[:max_linhas]
        ult = linhas[-1]
        while d.textlength(ult + "…", font=fonte) > largura and " " in ult:
            ult = ult.rsplit(" ", 1)[0]
        linhas[-1] = ult + "…"
    return linhas


def gerar_card(rel: dict, url: str = "") -> bytes:
    W, H, M = 1080, 1350, 72
    img = Image.new("RGB", (W, H), FUNDO)
    d = ImageDraw.Draw(img)
    y = M
    d.text((M, y), "CHECA VÍDEO", font=_fonte(30, True), fill=SUAVE)
    y += 60
    f_tit = _fonte(56, True)
    for linha in _quebrar(d, rel.get("titulo") or "Vídeo checado", f_tit, W - 2 * M, 3):
        d.text((M, y), linha, font=f_tit, fill=TINTA)
        y += 68
    y += 24

    est = rel["estatisticas"]
    # barra segmentada
    barra_h, x = 44, M
    larg_total = W - 2 * M
    if est["checaveis"]:
        segmentos = [(v, est["por_veredito"][v]) for v in VEREDITOS_CHECAVEIS if est["por_veredito"][v]]
        for i, (v, n) in enumerate(segmentos):
            w = round(larg_total * n / est["checaveis"]) if i < len(segmentos) - 1 else M + larg_total - x
            d.rectangle([x, y, x + w, y + barra_h], fill=CORES[v])
            x += w
    else:
        d.rectangle([M, y, M + larg_total, y + barra_h], fill=CORES["nao_checavel"])
    y += barra_h + 18
    f_leg = _fonte(28)
    x = M
    for v in VEREDITOS_CHECAVEIS:
        n = est["por_veredito"][v]
        if not n:
            continue
        txt = f"{SIMBOLO[v]} {VEREDITOS[v]['rotulo']} {est['porcentagens'][v]}%"
        larg = d.textlength(txt, font=f_leg)
        if x + larg > W - M:
            x = M
            y += 40
        d.text((x, y), txt, font=f_leg, fill=CORES[v] if v != "parcial" else (154, 103, 0))
        x += larg + 28
    y += 50
    d.text((M, y), f"{est['checaveis']} alegações checáveis", font=_fonte(28), fill=SUAVE)
    y += 64

    # 3 alegações mais importantes
    f_cit = _fonte(34)
    f_rot = _fonte(26, True)
    for a in importantes(rel["alegacoes"], 3):
        v = a["veredito"]
        rotulo = f" {SIMBOLO[v]} {VEREDITOS[v]['rotulo'].upper()} "
        lr = d.textlength(rotulo, font=f_rot)
        d.rounded_rectangle([M, y, M + lr + 8, y + 40], radius=8, fill=CORES[v])
        d.text((M + 4, y + 6), rotulo, font=f_rot, fill=(255, 255, 255))
        d.text((M + lr + 24, y + 6), hms(a["t_ini"]), font=_fonte(26), fill=SUAVE)
        y += 54
        for linha in _quebrar(d, f"“{a['citacao']}”", f_cit, W - 2 * M, 3):
            d.text((M, y), linha, font=f_cit, fill=TINTA)
            y += 44
        y += 30
        if y > H - 260:
            break

    # rodapé
    d.line([M, H - 170, W - M, H - 170], fill=(208, 215, 222), width=2)
    f_rod = _fonte(26)
    yy = H - 150
    for linha in _quebrar(d, AVISO, f_rod, W - 2 * M, 2):
        d.text((M, yy), linha, font=f_rod, fill=SUAVE)
        yy += 34
    if url:
        d.text((M, yy + 8), url, font=_fonte(24, True), fill=TINTA)
    if rel.get("simulado"):
        marca = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dm = ImageDraw.Draw(marca)
        dm.text((W // 2, H // 2), "SIMULADO", font=_fonte(180, True), fill=(207, 34, 46, 70), anchor="mm")
        img = Image.alpha_composite(img.convert("RGBA"), marca.rotate(30)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def gerar_pdf(rel: dict, url: str = "") -> bytes:
    from fpdf import FPDF

    c = config()
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(True, margin=16)
    pdf.add_font("dv", "", c.fonte_ttf)
    pdf.add_font("dv", "B", c.fonte_ttf_negrito)
    pdf.set_margins(16, 16, 16)
    pdf.add_page()
    largura = pdf.w - 32

    def texto(t: str, tam: float = 10.5, estilo: str = "", cor=TINTA, h: float = 5.6) -> None:
        pdf.set_font("dv", estilo, tam)
        pdf.set_text_color(*cor)
        pdf.multi_cell(largura, h, t, new_x="LMARGIN", new_y="NEXT")

    def titulo_secao(t: str) -> None:
        pdf.ln(3)
        texto(t, 13, "B", h=7)
        pdf.ln(1)

    texto("CHECA VÍDEO", 9, "B", SUAVE)
    texto(rel.get("titulo") or "Checagem de vídeo", 18, "B", h=8.5)
    meta = f"Duração {hms(rel['video']['duracao'])} · checado em {rel['checado_em'][:10]}"
    if rel.get("autor_ou_conta"):
        meta += f" · conta: {rel['autor_ou_conta']}"
    texto(meta, 9.5, cor=SUAVE)
    if url:
        pdf.set_font("dv", "", 9.5)
        pdf.set_text_color(9, 105, 218)
        pdf.cell(0, 5.5, url, link=url, new_x="LMARGIN", new_y="NEXT")
    if rel.get("simulado"):
        texto("RELATÓRIO SIMULADO — gerado sem IA, só para demonstração.", 10, "B", CORES["falso"])

    est = rel["estatisticas"]
    pdf.ln(3)
    x0, y0 = pdf.get_x(), pdf.get_y()
    x = x0
    if est["checaveis"]:
        for v in VEREDITOS_CHECAVEIS:
            n = est["por_veredito"][v]
            if n:
                w = largura * n / est["checaveis"]
                pdf.set_fill_color(*CORES[v])
                pdf.rect(x, y0, w, 5, style="F")
                x += w
    pdf.set_y(y0 + 7)
    texto("  ·  ".join(
        f"{VEREDITOS[v]['rotulo']} {est['porcentagens'][v]}%" for v in VEREDITOS_CHECAVEIS if est["por_veredito"][v]
    ), 9.5, cor=SUAVE)

    pdf.ln(2)
    for linha in rel.get("resumo", []):
        texto(linha, 11, "B", h=6)

    titulo_secao("Linha do tempo")
    for a in rel["alegacoes"]:
        v = a.get("veredito")
        if v == "nao_checavel":
            texto(f"{hms(a['t_ini'])}  “{a['citacao']}” — não checável "
                  f"({TIPOS_ALEGACAO.get(a['tipo'], a['tipo']).lower()})", 9, cor=SUAVE, h=5)
            continue
        if v is None:
            texto(f"{hms(a['t_ini'])}  “{a['citacao']}” — não verificada. {a.get('nota', '')}", 9, cor=SUAVE, h=5)
            continue
        pdf.ln(1.5)
        texto(f"{hms(a['t_ini'])}  “{a['citacao']}”", 10.5, "B")
        pdf.set_font("dv", "B", 9.5)
        pdf.set_text_color(255, 255, 255)
        pdf.set_fill_color(*CORES[v])
        rot = f" {SIMBOLO[v]} {VEREDITOS[v]['rotulo']} "
        pdf.cell(pdf.get_string_width(rot) + 2, 5.5, rot, fill=True)
        pdf.set_text_color(*SUAVE)
        pdf.set_font("dv", "", 9)
        pdf.cell(0, 5.5, f"  confiança {rotulo_confianca(a.get('confianca'))}", new_x="LMARGIN", new_y="NEXT")
        if a.get("explicacao"):
            texto(a["explicacao"], 10)
        if a.get("o_que_e_verdade_por_tras"):
            texto(f"O que é verdade por trás: {a['o_que_e_verdade_por_tras']}", 10, cor=SUAVE)
        for f in a.get("fontes", []):
            pdf.set_font("dv", "", 9)
            pdf.set_text_color(9, 105, 218)
            pdf.multi_cell(largura, 4.8, f"↗ {f['titulo']}", link=f["url"], new_x="LMARGIN", new_y="NEXT")

    titulo_secao("Acertos")
    for x in rel.get("acertos") or ["Nenhum acerto factual identificado."]:
        texto(f"• {x}")

    titulo_secao("Contagem")
    texto(f"{est['total']} alegações; {est['checaveis']} checáveis; {est['nao_checaveis']} não checáveis.")
    for v in VEREDITOS_CHECAVEIS:
        texto(f"{VEREDITOS[v]['rotulo']}: {est['por_veredito'][v]} ({est['porcentagens'][v]}%)", 10)
    texto(f"Porcentagens calculadas sobre as {est['checaveis']} alegações checáveis.", 9, cor=SUAVE)
    if est.get("frase"):
        texto(est["frase"], 10.5, "B")

    if rel.get("padrao_desinformacao"):
        titulo_secao("Como a desinformação é construída")
        texto(rel["padrao_desinformacao"])

    titulo_secao("Limitações")
    for x in rel.get("limitacoes") or ["Nenhuma registrada."]:
        texto(f"• {x}", 10)
    pdf.ln(2)
    texto(AVISO, 10, "B", CORES["falso"])

    if rel.get("fontes_consolidadas"):
        titulo_secao("Fontes")
        for f in rel["fontes_consolidadas"]:
            pdf.set_font("dv", "", 9)
            pdf.set_text_color(9, 105, 218)
            pdf.multi_cell(largura, 4.8, f"{f['titulo']} — {f['url']}", link=f["url"],
                           new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())
