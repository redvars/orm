import getORM from "./getORM.ts";

const odm = getORM();
const client = await odm.connect(true);

await client.defineTable({
  name: "ledger_entry",
  columns: [
    {
      name: "description",
      type: "string",
    },
  ],
});

// Successful transaction: both inserts commit together.
await client.transaction(async (tx) => {
  const ledgerTable = tx.table("ledger_entry");

  const first = ledgerTable.createNewRecord();
  first.set("description", "Opening balance");
  await first.insert();

  const second = ledgerTable.createNewRecord();
  second.set("description", "First deposit");
  await second.insert();
});

console.log(
  "After successful transaction, count :: " +
    (await client.table("ledger_entry").count()),
);

// Failing transaction: the insert is rolled back along with everything else.
try {
  await client.transaction(async (tx) => {
    const ledgerTable = tx.table("ledger_entry");

    const entry = ledgerTable.createNewRecord();
    entry.set("description", "This should not be persisted");
    await entry.insert();

    throw new Error("Something went wrong after the insert");
  });
} catch (error) {
  console.log("Transaction rolled back as expected:", (error as Error).message);
}

console.log(
  "After failed transaction, count (unchanged) :: " +
    (await client.table("ledger_entry").count()),
);

client.closeConnection();
