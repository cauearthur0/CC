import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <section className="caixa-erro">
      <h1>Página não encontrada</h1>
      <p>O link pode estar incompleto, ou a checagem foi apagada.</p>
      <Link className="botao primario" href="/">
        Checar um vídeo
      </Link>
    </section>
  );
}
