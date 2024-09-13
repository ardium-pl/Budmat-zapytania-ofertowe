import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { queryDb } from 'src/db';

export type ExistsPacket = RowDataPacket & { readonly EXISTS: 1 | 0 };

export const newExistsQuery = async (table: string, whereClause: string, args?: any[]): Promise<boolean> => {
    const res = await queryDb<ExistsPacket[]>(
        `SELECT EXISTS(SELECT 1 FROM coshop.${table} WHERE ${whereClause} LIMIT 1) as 'EXISTS';`,
        args
    );
    if (res.err) {
        throw res.err;
    }
    return Boolean(res.result[0].EXISTS);
};

export class UserModel {
  static async doesEmailExist(email: string): Promise<boolean> {
    return newExistsQuery('users', 'email = ?', [email]);
  }

  static async findByEmail(email: string): Promise<User | undefined> {
    const res = await queryDb<RowDataPacket[]>('SELECT * FROM users WHERE email = ? LIMIT 1;', [email]);
    if (res.err) {
      throw res.err;
    }
    return res.result[0] as User | undefined;
  }

  static async findById(id: string): Promise<User | undefined> {
    const res = await queryDb<RowDataPacket[]>('SELECT * FROM users WHERE id = ? LIMIT 1;', [id]);
    if (res.err) {
      throw res.err;
    }
    return res.result[0] as User | undefined;
  }

  static async createNewUser(email: string, hashedPassword: string) {
    const res = await queryDb<ResultSetHeader>('INSERT INTO users (email, password) VALUES (?, ?);', [
      email,
      hashedPassword,
    ]);
    if (res.err) {
      throw res.err;
    }
    return res.result;
  }

  static async changePassword(email: string, hashedPassword: string) {
    const res = await queryDb<ResultSetHeader>('UPDATE users SET password = ? WHERE email = ?;', [
      hashedPassword,
      email,
    ]);
    if (res.err) {
      throw res.err;
    }
    return res.result;
  }

  static async updateLastLogin(id: string) {
    const res = await queryDb<ResultSetHeader>(
      `
        UPDATE users
        SET last_login = NOW()
        WHERE id = ?;
      `,
      [id]
    );
    if (res.err) {
      throw res.err;
    }
    return res.result;
  }
}
export interface User {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly password: string;
  readonly created_date: Date;
  readonly last_login: Date;
}