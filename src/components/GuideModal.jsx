export default function GuideModal({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14,22,28,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 70,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: 12,
          padding: "24px 28px",
          width: 720,
          maxWidth: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>📖 Mode d'emploi</h2>
          <button
            onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: "1.2rem", color: "var(--ink-soft)" }}
          >
            ✕
          </button>
        </div>
        <p style={{ color: "var(--ink-soft)", fontSize: "0.82rem", margin: "0 0 18px" }}>
          Suivi machines — Groupe PSV
        </p>

        <Section title="Se connecter">
          <ul style={ulStyle}>
            <li>
              <strong>Manipulateur</strong> : un bouton par centre sur l'écran d'accès, sans mot de passe.
              Donne accès uniquement au Registre Pannes et à la Liste des pannes.
            </li>
            <li>
              <strong>Compte personnel</strong> : identifiant + mot de passe, créé par un administrateur
              dans l'onglet Utilisateurs. Trois rôles possibles :
              <ul style={ulStyle}>
                <li><strong>Physicien</strong> : accès à tout, sauf Utilisateurs et Logs.</li>
                <li><strong>Visualisation</strong> : mêmes informations que Physicien, mais aucune modification possible.</li>
                <li><strong>Admin</strong> : accès à tout, y compris Utilisateurs et Logs.</li>
              </ul>
            </li>
            <li>
              Chaque compte est rattaché à <strong>un centre précis</strong> ou à <strong>tous les
              centres</strong> (dans ce cas, un sélecteur de centre apparaît en haut de l'appli).
            </li>
          </ul>
        </Section>

        <Section title="Registre Pannes">
          <ul style={ulStyle}>
            <li>Un sous-onglet par machine Radixact/Varian.</li>
            <li>Formulaire en haut pour ajouter une panne : date, heure de début/fin, erreur rencontrée (liste déroulante), commentaire.</li>
            <li>
              Les pannes sont regroupées <strong>par mois</strong>, repliées par défaut sauf le mois en
              cours — cliquez sur un bandeau de mois pour le déplier et charger son contenu.
            </li>
            <li>Un badge <strong>#WO</strong> apparaît devant une panne dès qu'elle a été rattachée à un Work Order.</li>
          </ul>
        </Section>

        <Section title="Work Order">
          <ul style={ulStyle}>
            <li>Un sous-onglet par machine et par logiciel (RayStation, Mosaiq…).</li>
            <li>Colonnes triables en cliquant sur leur en-tête (Découverte, Statut, Statut WO, Intervention, Rapport).</li>
            <li>Le bouton <strong>▸ / ▾</strong> déplie les détails : commentaires, immobilisations, maintenance préventive, pannes liées.</li>
            <li>Le bouton <strong>+</strong> ouvre la fenêtre des périodes d'immobilisation et de la résolution par maintenance préventive.</li>
            <li>Le bouton <strong>🔗</strong> permet de sélectionner les pannes du Registre Pannes que ce Work Order résout.</li>
          </ul>
        </Section>

        <Section title="Registre des Interventions">
          <ul style={ulStyle}>
            <li>
              Vue unifiée de tous les événements d'un équipement, avec un code couleur : rouge
              (maintenance corrective, reprise automatiquement depuis Work Order), bleu (contrôle
              qualité), vert (maintenance préventive), violet (paramétrage machine), gris (autre).
            </li>
            <li>Seuls les événements saisis ici (pas ceux venant de Work Order) peuvent être modifiés ou supprimés.</li>
            <li>Regroupement automatique par mois.</li>
          </ul>
        </Section>

        <Section title="Statistiques">
          <ul style={ulStyle}>
            <li>Sous-onglets : uniquement les machines ayant un Registre Pannes.</li>
            <li>Diagramme en anneau : taux de disponibilité du mois sélectionné, détaillé par catégorie d'immobilisation.</li>
            <li>Histogramme de projection : 2 derniers mois, mois en cours, 3 prochains mois.</li>
            <li>Graphique d'évolution sur 12 mois glissants (WO ouverts / pannes signalées).</li>
            <li>Bouton <strong>📄 Générer le rapport PDF</strong> pour exporter tout ça en un document à transmettre.</li>
            <li>Nécessite d'avoir saisi une disponibilité théorique par mois dans Registre du matériel.</li>
          </ul>
        </Section>

        <Section title="Liste des pannes">
          <ul style={ulStyle}>
            <li>Gère la liste déroulante « Erreur rencontrée » du Registre Pannes.</li>
            <li>Chaque entrée est rattachée à un type de machine (Radixact, Varian…) — un filtre permet de s'y retrouver.</li>
            <li>Désactiver une entrée la masque du formulaire sans supprimer l'historique déjà saisi.</li>
          </ul>
        </Section>

        <Section title="Registre du matériel">
          <ul style={ulStyle}>
            <li>
              Bouton <strong>+ Ajouter un équipement</strong> : machine, logiciel, matériel de mesure,
              fantôme ou équipement — chaque catégorie a ses propres informations à suivre.
            </li>
            <li>
              Un sous-onglet Work Order est toujours créé automatiquement ; un sous-onglet Registre
              Pannes en plus si c'est une machine Radixact ou Varian.
            </li>
            <li>Les entrées sont regroupées par catégorie, en sous-groupes repliables.</li>
            <li>
              Bouton <strong>✎ Modifier</strong> pour changer le nom, le constructeur, le centre, le n°
              de série, la date de mise en service, et selon la catégorie : les échéances de la machine
              (ASNR, contrôle qualité externe, EQUAL ESTRO), l'historique des versions (machine/logiciel),
              la fréquence d'étalonnage (matériel de mesure), ou la disponibilité théorique mensuelle.
            </li>
            <li>La suppression d'un matériel efface aussi définitivement tout son historique de pannes/Work Orders.</li>
          </ul>
        </Section>

        <Section title="Utilisateurs et centres (Admin uniquement)">
          <ul style={ulStyle}>
            <li>Créez ici les centres (code + nom affiché).</li>
            <li>Bouton <strong>+ Ajouter un utilisateur</strong> : nom, identifiant, mot de passe, rôle, centre (ou « Tous les centres »).</li>
            <li>Modifiable directement dans le tableau (mot de passe, rôle, centre).</li>
          </ul>
        </Section>

        <Section title="Logs (Admin uniquement)">
          <ul style={ulStyle}>
            <li>Historique de toutes les actions de modification des 3 derniers mois glissants.</li>
            <li>Filtrable par utilisateur. Les entrées de plus de 3 mois sont purgées automatiquement.</li>
          </ul>
        </Section>

        <Section title="Mon compte">
          <ul style={ulStyle}>
            <li>Le menu 👤 en haut à droite permet de changer votre mot de passe personnel ou de vous déconnecter.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h3
        style={{
          margin: "0 0 6px",
          fontSize: "0.92rem",
          color: "var(--accent-strong)",
          borderBottom: "1px solid var(--border)",
          paddingBottom: 6,
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

const ulStyle = { margin: "6px 0 0", paddingLeft: 20, fontSize: "0.85rem", lineHeight: 1.6, color: "var(--ink)" };