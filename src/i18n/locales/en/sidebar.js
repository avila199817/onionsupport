/* =========================================================
   Onion SPA - I18n English
   Archivo: src/i18n/locales/en/en.js

   Responsabilidades:
   - English translations for Sidebar
   - route titles translations
   - exact key parity with es / ca
   - prepared for live i18n runtime
========================================================= */

export const en = {
  sidebar: {
    aria: {
      main: "Main sidebar",
      navigation: "Main navigation",
    },

    logo: {
      ariaLabel: "Go to home",
      tooltip: "Home",
      alt: "Onion Support",
    },

    toggle: {
      collapse: "Collapse sidebar",
    },

    menu: {
      home: "Home",
      tickets: "Tickets",
      invoices: "Invoices",
      users: "Users",
      clients: "Clients",
      account: "Account",
      settings: "Settings",
      server: "Server",
    },

    recents: {
      ariaLabel: "Recent",
      title: "Recent",
    },

    user: {
      toggleAriaLabel: "Open user menu",
      avatarAriaLabel: "User avatar",
      defaultName: "User",
      dropdownAriaLabel: "User menu",

      addAccount: "Add account",
      changePlan: "Change plan",
      profile: "Profile",
      settings: "Settings",
      help: "Help",
      logout: "Log out",
    },
  },

  routes: {
    home: "Onion Support",
    incidencias: "Tickets",
    facturas: "Invoices",
    usuarios: "Users",
    clientes: "Clients",
    cuenta: "Account",
    ajustes: "Settings",
    servidor: "Server",
    login: "Login",
  },
};

export default en;
