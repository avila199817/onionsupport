/* =========================================================
   Onion SPA - I18n Català
   Archivo: src/i18n/locales/ca.js

   Responsabilidades:
   - definir traducciones en catalán
   - cubrir las keys del sidebar
   - mantener estructura consistente con el resto de locales
   - preparado para i18n runtime live
========================================================= */

export const ca = {
  sidebar: {
    aria: {
      main: "Barra lateral principal",
      navigation: "Navegació principal",
    },

    logo: {
      ariaLabel: "Anar a l'inici",
      tooltip: "Inici",
      alt: "Onion Support",
    },

    toggle: {
      collapse: "Contraure la barra lateral",
    },

    menu: {
      home: "Inici",
      tickets: "Incidències",
      invoices: "Factures",
      users: "Usuaris",
      clients: "Clients",
      account: "Compte",
      settings: "Configuració",
    },

    recents: {
      ariaLabel: "Recents",
      title: "Recents",
    },

    user: {
      toggleAriaLabel: "Obrir el menú d'usuari",
      avatarAriaLabel: "Avatar d'usuari",
      defaultName: "Usuari",
      dropdownAriaLabel: "Menú d'usuari",

      addAccount: "Afegir compte",
      changePlan: "Canviar pla",
      profile: "Perfil",
      settings: "Configuració",
      help: "Ajuda",
      logout: "Tancar sessió",
    },
  },
};

export default ca;
