// Entrega o conteúdo (dados) só para quem tem a chave do link.
const crypto = require("crypto");

function keyOk(given) {
  if (process.env.PORTAL_PUBLIC === "true") return true; // painel aberto, sem chave
  const expected = process.env.PORTAL_KEY || "";
  if (expected.length < 12 || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!keyOk(req.query.k)) return res.status(401).json({ error: "link inválido" });
  res.status(200).json(require("./_dados.json"));
};
