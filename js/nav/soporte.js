window.addEventListener("load", () => {
  const nav = document.querySelector(".nav-top");
  const footer = document.querySelector(".footer");

  if (nav) {
    nav.style.opacity = "1";
    nav.style.pointerEvents = "auto";
  }

  if (footer) {
    footer.style.opacity = "1";
    footer.style.pointerEvents = "auto";
  }
});