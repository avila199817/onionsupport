import assert from "node:assert/strict";
import Http from "../src/core/http.js";
import { AppCore } from "../src/core/index.js";
import { notifyDomainChanged } from "../src/core/domain-events.js";
import * as Clientes from "../src/views/clientes/clientes.api.js";
import * as Facturas from "../src/views/facturas/facturas.api.js";

const originalGet = Http.get;
const originalPost = Http.post;
let sessionNumber = 0;
const session = () => AppCore.applySession({
  user: { userId: "ON-CONSUMER-AUDIT", name: "Contacto actual", role: "admin" },
  token: `fixture-token-${++sessionNumber}`,
  session: { sessionId: `fixture-session-${sessionNumber}` },
});
const fiscal = Object.freeze({
  nombreContacto: "Receptor fiscal histórico", razonSocial: "Empresa histórica",
  nif: "FISCAL-FIXTURE", direccion: { calle: "Calle histórica" },
});
const cliente = (avatar = "", name = "Contacto actual") => ({
  clienteId: "CLI-CONSUMER-AUDIT", userId: "ON-CONSUMER-AUDIT",
  nombreFiscal: "Empresa actual", nombreContacto: name, avatarUrl: avatar,
});
const factura = (avatar = "") => ({
  id: "FAC-CONSUMER-AUDIT", userId: "ON-CONSUMER-AUDIT",
  clienteNombre: fiscal.nombreContacto, clienteSnapshot: structuredClone(fiscal),
  avatarUrl: avatar, total: 17, paymentStatus: "paid",
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const cases = [
  {
    name: "cliente detail", id: "CLI-CONSUMER-AUDIT",
    read: () => Clientes.getClienteById("CLI-CONSUMER-AUDIT"),
    peek: () => Clientes.getClienteByIdStore("CLI-CONSUMER-AUDIT"),
    response: (avatar) => ({ ok: true, cliente: cliente(avatar) }),
    item: (result) => result,
  },
  {
    name: "cliente page", id: "CLI-CONSUMER-AUDIT",
    read: () => Clientes.fetchClientesPage(),
    peek: () => Clientes.getItems()[0],
    response: (avatar) => ({ ok: true, items: [cliente(avatar)] }),
    item: (result) => result.items[0],
  },
  {
    name: "factura detail", id: "FAC-CONSUMER-AUDIT",
    read: () => Facturas.getFacturaById("FAC-CONSUMER-AUDIT"),
    peek: () => Facturas.peekFacturaDetail("FAC-CONSUMER-AUDIT"),
    response: (avatar) => ({ ok: true, factura: factura(avatar) }),
    item: (result) => result,
  },
];

try {
  session();
  let photo = "https://example.test/old.png";
  let name = "Nombre anterior";
  let reads = 0;
  Http.get = async (path) => {
    reads += 1;
    return path.includes("/clientes/")
      ? { ok: true, cliente: cliente(photo, name) }
      : { ok: true, factura: factura(photo) };
  };
  await Clientes.getClienteById("CLI-CONSUMER-AUDIT");
  await Facturas.getFacturaById("FAC-CONSUMER-AUDIT");
  for (const nextPhoto of ["https://example.test/new.png", ""]) {
    photo = nextPhoto;
    name = "Nombre confirmado";
    const before = reads;
    notifyDomainChanged("usuarios");
    assert.equal(Clientes.getClienteByIdStore("CLI-CONSUMER-AUDIT"), null);
    assert.equal(Facturas.peekFacturaDetail("FAC-CONSUMER-AUDIT"), null);
    const currentCliente = await Clientes.getClienteById("CLI-CONSUMER-AUDIT");
    const currentFactura = await Facturas.getFacturaById("FAC-CONSUMER-AUDIT");
    assert.equal(reads - before, 2, "cada proyección invalidada vuelve a su API propietaria");
    assert.equal(currentCliente.avatarUrl, nextPhoto);
    assert.equal(currentCliente.nombreContacto, name);
    assert.equal(currentFactura.avatarUrl, nextPhoto);
    assert.equal(currentFactura.clienteNombre, fiscal.nombreContacto);
    assert.deepEqual(currentFactura.clienteSnapshot, fiscal,
      "la invalidación no reescribe la identidad ni los datos fiscales históricos");
  }

  session();
  assert.equal(Clientes.getClienteByIdStore("CLI-CONSUMER-AUDIT"), null);
  assert.equal(Facturas.peekFacturaDetail("FAC-CONSUMER-AUDIT"), null);

  for (const invalidate of [
    () => notifyDomainChanged("usuarios"),
    session,
  ]) {
    for (const consumer of cases) {
      session();
      const oldResponse = deferred();
      const freshResponse = deferred();
      let requestCount = 0;
      Http.get = () => ++requestCount === 1 ? oldResponse.promise : freshResponse.promise;
      const oldRead = consumer.read();
      const oldRejected = assert.rejects(oldRead, { name: "AbortError" }, consumer.name);
      invalidate();
      const freshRead = consumer.read();
      assert.equal(requestCount, 2,
        `${consumer.name}: una nueva vida de caché no reutiliza una petición antigua`);
      freshResponse.resolve(consumer.response("https://example.test/current.png"));
      assert.equal(consumer.item(await freshRead).avatarUrl, "https://example.test/current.png");
      oldResponse.resolve(consumer.response("https://example.test/stale.png"));
      await oldRejected;
      assert.equal(consumer.peek().avatarUrl, "https://example.test/current.png",
        `${consumer.name}: una respuesta tardía no repuebla la caché`);
    }
  }

  // The public invoice prefetch still shares one request within a live scope.
  session();
  const sharedResponse = deferred();
  let invoiceReads = 0;
  Http.get = () => { invoiceReads += 1; return sharedResponse.promise; };
  const prefetched = Facturas.prefetchFacturaDetail("FAC-CONSUMER-AUDIT");
  const opened = Facturas.getFacturaById("FAC-CONSUMER-AUDIT");
  assert.equal(invoiceReads, 1);
  sharedResponse.resolve({ ok: true, factura: factura("") });
  const [prefetchItem, openedItem] = await Promise.all([prefetched, opened]);
  assert.equal(prefetchItem.id, openedItem.id);

  // A profile notification must not duplicate a client creation already sent.
  const createResponse = deferred();
  let creates = 0;
  Http.post = () => { creates += 1; return createResponse.promise; };
  const createBody = { userId: "ON-CONSUMER-AUDIT", tipo: "empresa", nombreFiscal: "Empresa actual" };
  const creating = Clientes.createCliente(createBody);
  notifyDomainChanged("usuarios");
  const joined = Clientes.createCliente(createBody);
  assert.equal(creating, joined);
  assert.equal(creates, 1);
  createResponse.resolve({ ok: true, clienteId: "CLI-CONSUMER-AUDIT" });
  await creating;
  console.log("private consumer identity cache contract: passed (injected HTTP; no network)");
} finally {
  Http.get = originalGet;
  Http.post = originalPost;
  Clientes.clearClientesCache();
  Facturas.clearFacturaDetailPrefetchCache();
  AppCore.clearSession();
}
