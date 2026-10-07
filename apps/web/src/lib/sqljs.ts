import type { SqlDatabase, SqlEngine } from '@mnemo/importers';
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';

let loading: Promise<SqlJsStatic> | undefined;

/** Loads sql.js and its WebAssembly binary on first use only (Anki packages are rare). */
function loadSqlJs(): Promise<SqlJsStatic> {
  loading ??= Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm-browser.wasm?url')]).then(
    ([mod, wasm]) => mod.default({ locateFile: () => wasm.default }),
  );
  loading.catch(() => {
    loading = undefined;
  });
  return loading;
}

function wrap(db: Database): SqlDatabase {
  return {
    all(sql, params = []) {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params as SqlValue[]);
        const rows: Record<string, unknown>[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    },
    run(sql, params) {
      if (params) db.run(sql, params as SqlValue[]);
      else db.exec(sql);
    },
    export: () => db.export(),
    close: () => {
      db.close();
    },
  };
}

/** Browser SQL engine for `.apkg` import and export (sql.js, MIT). */
export const sqlJsEngine: SqlEngine = {
  async open(bytes) {
    const SQL = await loadSqlJs();
    return wrap(new SQL.Database(bytes));
  },
};
