import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({
    meta: [
      { title: "Confidentialité" },
      { name: "description", content: "Quelles données sont gardées et qui peut les voir." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <main>
      <div className="wrap privacy-page">
        <h1>CONFIDENTIALITÉ</h1>
        <h2>Ce qui est enregistré</h2>
        <p>
          Ton e-mail et ton mot de passe (chiffré) pour te connecter, ton pseudo, ton avatar, et ce
          que tu crées en jouant : fiches, jets de dés, bloc-notes et messages, ainsi que tes
          échanges avec le support.
        </p>
        <h2>Qui peut le voir</h2>
        <ul>
          <li>Les membres de ton équipe voient ton pseudo, ton avatar et tes jets publics.</li>
          <li>Le MJ de ton équipe voit tes fiches, ton bloc-notes et tes messages.</li>
          <li>
            L’administrateur du site peut accéder à tout, y compris aux fiches, bloc-notes et
            messages privés, et voit ton e-mail, pour gérer les comptes et assurer le bon
            fonctionnement du site.
          </li>
          <li>
            Les messages sont analysés automatiquement pour repérer les propos haineux, les menaces
            ou les arnaques. Rien n’est bloqué, mais les messages repérés sont signalés à
            l’administrateur, qui peut suspendre un compte.
          </li>
          <li>Ton e-mail n’est jamais affiché aux autres joueurs ni aux MJ.</li>
        </ul>
        <h2>Tes droits</h2>
        <p>
          Tu peux modifier tes informations dans ton profil et supprimer ton compte à tout moment
          depuis cette même page. Tes fiches restent alors dans leur équipe, sans joueur, et ton
          profil, tes avatars et tes jets sont supprimés.
        </p>
        <p className="note">
          <Link to="/">Retour</Link>
        </p>
      </div>
    </main>
  );
}
