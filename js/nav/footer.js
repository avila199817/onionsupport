document.addEventListener("DOMContentLoaded", initFooter);

async function initFooter() {

  const container = document.getElementById("footer-container");
  if (!container) return;

  try {

    const res = await fetch("/es/components/footer.html", {
      cache: "force-cache"
    });

    if (!res.ok) throw new Error("FOOTER_LOAD_ERROR");

    container.innerHTML = await res.text();

  } catch (err) {
    console.error("FOOTER LOAD ERROR", err);
  }
}