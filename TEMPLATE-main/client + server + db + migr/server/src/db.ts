import { ERROR_STR } from '@utils/console-colors';
import mysql, { FieldPacket, QueryError, QueryResult } from 'mysql2';

export const connectToDb = () => {
  try {
    const conn = mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      port: Number(process.env.DB_PORT),
    });
    return conn;
  } catch (err) {
    throw new Error(`${ERROR_STR}Unable to connect to database.`);
  }
};

export const queryDb = async <T extends QueryResult = QueryResult>(
  queryString: string,
  args?: any[]
): Promise<{ err: QueryError | null; result: T; fields: FieldPacket[] }> => {
  return new Promise(resolve => {
    if (args) {
      connectToDb().query<T>(queryString, args, (err, result, fields) => {
        resolve({ err, result, fields });
      });
      return;
    }
    connectToDb().query<T>(queryString, (err, result, fields) => {
      resolve({ err, result, fields });
    });
  });
};
