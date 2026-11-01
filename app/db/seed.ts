import { ensureCatalogSeeded } from "../api/services/catalogService";

async function seed() {
  console.log("Seeding INTENTLOCK demo catalogue...");
  await ensureCatalogSeeded();
  console.log("Done. Products are inserted only when the catalogue is empty.");
  process.exit(0);
}

seed();
