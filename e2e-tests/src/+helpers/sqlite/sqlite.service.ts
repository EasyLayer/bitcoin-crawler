import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as sqlite3 from 'sqlite3';

export interface SQLiteConfig {
  path: string;
}

export class SQLiteService {
  private db!: sqlite3.Database | null;
  private _path: string;

  constructor({ path }: SQLiteConfig) {
    this._path = path;
  }

  public get connection(): sqlite3.Database {
    if (!this.db) {
      throw new Error('Database is not connected');
    }
    return this.db;
  }

  public async connect(): Promise<void> {
    try {
      // This call will create a new database if it doesn't exist
      await this.openDatabase();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }

  public async exec(query: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.exec(query, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        reject('Connection was lost');
      }
    });
  }

  public async all(query: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.all(query, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      } else {
        reject('Connection was lost');
      }
    });
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            return reject(err);
          }
          this.db = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public async initializeDatabase(pathToSQL: string): Promise<void> {
    try {
      const dbExists = await this.checkDatabaseExists();
      if (!dbExists) {
        const sql = readFileSync(path.resolve(pathToSQL), 'utf-8');
        await this.openDatabase();
        await this.exec(sql);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }

  private async openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this._path, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Check if any table exists
  private async checkDatabaseExists(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.db) {
        return resolve(false);
      }
      this.db.get("SELECT name FROM sqlite_master WHERE type='table'", [], (err, row) => {
        resolve(!err && !!row);
      });
    });
  }
}
