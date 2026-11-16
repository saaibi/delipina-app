import { Capacitor } from "@capacitor/core";
import { openDB } from "idb";
export async function storage() {
  if (!Capacitor.isNativePlatform())
    return openDB("delipina-offline", 1, {
      upgrade(db) {
        db.createObjectStore("cache");
        db.createObjectStore("queue", { keyPath: "key" });
      },
    });
  const { SQLiteConnection, CapacitorSQLite } =
    await import("@capacitor-community/sqlite");
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const db = await sqlite.createConnection(
    "delipina",
    false,
    "no-encryption",
    1,
    false,
  );
  await db.open();
  await db.execute(
    "CREATE TABLE IF NOT EXISTS local_store(store TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(store,key));",
  );
  return {
    async put(store, value, key) {
      await db.run("INSERT OR REPLACE INTO local_store VALUES(?,?,?)", [
        store,
        key || value.key,
        JSON.stringify(value),
      ]);
    },
    async get(store, key) {
      const r = await db.query(
        "SELECT value FROM local_store WHERE store=? AND key=?",
        [store, key],
      );
      return r.values?.[0] ? JSON.parse(r.values[0].value) : undefined;
    },
    async getAll(store) {
      const r = await db.query("SELECT value FROM local_store WHERE store=?", [
        store,
      ]);
      return (r.values || []).map((r) => JSON.parse(r.value));
    },
    async delete(store, key) {
      await db.run("DELETE FROM local_store WHERE store=? AND key=?", [
        store,
        key,
      ]);
    },
    async clear(store) {
      await db.run("DELETE FROM local_store WHERE store=?", [store]);
    },
  };
}
