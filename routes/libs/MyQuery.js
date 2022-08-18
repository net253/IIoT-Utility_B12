class MyQuery {
  constructor(config) {
    this.mssql = require("mssql");
    this.config = config;
  }

  query(sql) {
    return new Promise(async (resolve, reject) => {
      try {
        const pool = await this.mssql.connect(this.config);
        const query = await pool.request().query(sql);

        resolve({ state: true, query });
      } catch (error) {
        console.log(error);
        reject({ state: false, query: {} });
      }
    });
  }
}

module.exports = MyQuery;
