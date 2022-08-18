const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();
const MyQuery = require("./libs/MyQuery");
const config = require("./libs/config");

const conn = new MyQuery(config);

router.get("/", (req, res) => {
  res.send({ state: true, message: "Utility Api." });
});

router.post("/overview", async (req, res) => {
  try {
    const { dateMonth } = req.body;
    const fmonth = new Date(dateMonth).getUTCMonth() + 1;
    const fyear = new Date(dateMonth).getUTCFullYear();
    const sql = ` SELECT Month,year AS Year,SUM(total) AS total,Max(NewExCumutotal) AS TotalExp  FROM EDayDataTDB WHERE month = '${fmonth}' AND year = '${fyear}' GROUP BY month,year  ;
                  SELECT * FROM EDataJoinDayTotalDB WHERE month = '${fmonth}' AND year = '${fyear}' ;
                  SELECT *,MAX(CumulativeActualEx) OVER(PARTITION BY month,year  order BY month,year ) AS Expense FROM WFullJoinDataMonth WHERE month = '${fmonth}' AND year = '${fyear}' ;
                  SELECT * FROM WFullJoinDataDay WHERE month = '${fmonth}' AND year = '${fyear}' ; 
                  SELECT day,Month,Year,total,totaltarget,sum(total) OVER(PARTITION BY Month ORDER BY day) AS CumuUnit,
                  sum(TotalTarget) OVER(PARTITION BY Month ORDER BY day) AS CumuTarget FROM EDataJoinDayTotalDB 
                  WHERE month = '${fmonth}' AND year = '${fyear}' ;`;
    const {
      state,
      query: { recordsets },
    } = await conn.query(sql);

    const monthDB = recordsets[0];
    const dayDB = recordsets[1];
    const monthWater = recordsets[2];
    const dayWater = recordsets[3];
    const cumulativeDay = recordsets[4];

    res.send({
      state,
      results: { monthDB, dayDB, monthWater, dayWater, cumulativeDay },
    });
  } catch (error) {
    console.error(error);
    res.send({ state: false, message: error });
  }
});

router.post("/electric", async (req, res) => {
  try {
    const { filter } = req.body;
    let sql = "";

    ["TDB", "DB2", "DB3", "DB4", "DB5"].map((text) => {
      if (filter == "month") {
        sql += ` SELECT *,(ISNULL(OnExpenseEDay,0)+NewExOff) AS ExDay,NewCumuoffpeak*2.6037 AS NewExCumulativeOff FROM EDayData${text};`;
      } else {
        sql += `		SELECT Month,Year,
        OnpeakCumulative AS Onpeak,
        NewCumuoffpeak AS Offpeak,
        ExCumulativeOn AS ExOn,
        NewExOff AS ExOff,
        total,TotalTarget,NewExOn,Extotal,NewUnitTotal,CumuTarget
        ,SUM(OnpeakCumulative) OVER ( PARTITION by year ORDER BY MONTH,Year) AS OnpeakCumulative
        ,SUM(NewCumuoffpeak) OVER ( PARTITION by year ORDER BY MONTH,Year) AS NewCumuoffpeak 
        ,SUM(NewExOn) OVER ( PARTITION by year ORDER BY MONTH,Year) AS ExCumulativeOn
        ,SUM(NewCumuoffpeak) OVER ( PARTITION by year ORDER BY MONTH,Year) * 2.6037  AS NewExCumulativeOff
        ,SUM(Extotal) OVER ( PARTITION by year ORDER BY MONTH,Year) AS NewExCumuTotal
		    ,NewUnitTotal AS CumuTotal
        FROM EMonthData${text} ;
        `;
      }
    });

    for (let i = 2; i <= 5; i++) {
      sql += ` SELECT TOP 1 * FROM EUnitDB${i} ORDER BY id DESC;`;
    }

    const {
      state,
      query: { recordsets },
    } = await conn.query(sql);

    const overall = recordsets[0];
    const db2 = recordsets[1];
    const db3 = recordsets[2];
    const db4 = recordsets[3];
    const db5 = recordsets[4];
    const cvpuDB2 = recordsets[5];
    const cvpuDB3 = recordsets[6];
    const cvpuDB4 = recordsets[7];
    const cvpuDB5 = recordsets[8];

    res.send({
      state,
      results: {
        overall,
        db2,
        db3,
        db4,
        db5,
        cvpu: { cvpuDB2, cvpuDB3, cvpuDB4, cvpuDB5 },
      },
    });
  } catch (error) {
    res.send({ state: false, message: error });
  }
});

router.post("/water", async (req, res) => {
  try {
    const { filter } = req.body;
    let sql = "";
    if (filter === "month") {
      sql += `SELECT  *,sum(Target) OVER(ORDER BY month,day) AS CumuTarget,
      sum(ActualUnit) OVER(ORDER BY month,day) AS CumuUnit,
      sum(Daytime) OVER(PARTITION BY month,year ORDER BY month,day) AS CumuResetDaytime,
      sum(Daytime) OVER(ORDER BY month,day) AS CumuDaytime,
      sum(nighttime) OVER(PARTITION BY month,year ORDER BY month,day) AS CumuResetNighttime,
      sum(nighttime) OVER(ORDER BY month,day) AS CumuNighttime,
      sum(ActualUnit) OVER(PARTITION BY month,year ORDER BY month,day) AS CumuResetUnit,
      ABS((ActualUnit-Target)/Target * 100) AS 'error' FROM WFullJoinDataDay `;
    } else {
      sql += `
      SELECT month,year,MAX(ActualUnit) OVER(PARTITION BY month  order BY month ) AS Unit,
        MAX(Target) OVER(PARTITION BY month,year  order BY month,year ) AS Target,
        MAX(DayTime) OVER(PARTITION BY month,year  order BY month,year ) AS Daytime,
        MAX(NightTime) OVER(PARTITION BY month,year  order BY month,year ) AS NightTime,
        MAX(CumulativeActualEx) OVER(PARTITION BY month,year  order BY month,year ) AS Expense,
        SUM(ActualUnit) OVER(order BY month,year  ) AS Unitcumulative,
        SUM(ActualUnit) OVER(PARTITION BY year order BY month,year  ) AS UnitcumulativeResetY,
        SUM(Target) OVER(order BY month,year  )AS Targetcumulative,
        SUM(DayTime) OVER(order BY month,year )AS DayTimecumulative,
        SUM(DayTime) OVER(PARTITION BY year order BY month,year )AS DayTimecumulativeResetY,
        SUM(NightTime) OVER(order BY month,year )AS NightTimecumulative,
        SUM(NightTime) OVER(PARTITION BY year order BY month,year )AS NightTimecumulativeResetY,
        SUM(CumulativeActualEx) OVER(PARTITION BY year order BY month,year )AS CumuExpense,
        SUM(ActualUnit) OVER(PARTITION BY year order BY month,year )AS TotalUnit,
      CASE WHEN Target < 11 THEN Target * 18.25 
        WHEN Target >= 11 AND Target < 21 THEN ((Target - 10) * 21.5) + 182.25 
        WHEN Target >= 21 AND Target < 31 THEN ((Target - 20) * 25.5) + 397.5
        WHEN Target >= 31 AND Target < 51 THEN ((Target - 30) * 28.5) + 652.5 
        WHEN Target >= 51 AND Target < 81 THEN ((Target - 50) * 31) + 1222.5 
        WHEN Target >= 81 AND Target < 101 THEN ((Target - 80) * 31.25) + 2152.5 
        WHEN Target >= 101 AND Target < 301 THEN ((Target - 100) * 31.5) + 2777.5 
        WHEN Target >= 301 AND Target < 1001 THEN ((Target - 300) * 31.75) + 9077.5 
        WHEN Target >= 1001 AND Target < 2001 THEN ((Target - 1000) * 32) + 31302.5
        WHEN Target >= 2001 AND Target < 3001 THEN ((Target - 2000) * 32.25) + 63302.5
        WHEN Target >= 3001 THEN (Target * 32.5) + 95552.5 ELSE 0 END AS CumulativeTargetEx
        FROM WFullJoinDataMonth`;
    }
    const {
      state,
      query: { recordset },
    } = await conn.query(sql);
    res.send({ state, results: recordset });
  } catch (error) {
    res.send({ state: false, message: error });
  }
});

router.post("/electric-target", async (req, res) => {
  try {
    const { target } = req.body;
    const newTarget = target.reduce((cDB, item) => {
      const time = new Date(
        Object.keys(item)[0].split("-")[0].split("/").reverse().join("/")
      ).getTime();
      const oneDay = 60 * 60 * 24 * 1000;
      const db = Object.keys(item)[0].split("-")[1].toUpperCase();
      const unit = +item[Object.keys(item)];
      const date = new Date(time + oneDay).toISOString();
      const nowDB = {
        [db]: `('${date}','${(unit / 24) * 11}','${(unit / 24) * 13}')`,
      };
      return !cDB[db]
        ? { ...cDB, [db]: [nowDB[db]] }
        : { ...cDB, [db]: [...cDB[db], nowDB[db]] };
    }, {});

    const sql = ` INSERT INTO EUnitTargetDB2(Datetime, OnpeakTarget, OffpeakTarget) VALUES ${newTarget.DB2.join(
      ","
    )} ;
                  INSERT INTO EUnitTargetDB3(Datetime, OnpeakTarget, OffpeakTarget) VALUES ${newTarget.DB3.join(
                    ","
                  )} ;
                  INSERT INTO EUnitTargetDB4(Datetime, OnpeakTarget, OffpeakTarget) VALUES ${newTarget.DB4.join(
                    ","
                  )} ;
                  INSERT INTO EUnitTargetDB5(Datetime, OnpeakTarget, OffpeakTarget) VALUES ${newTarget.DB5.join(
                    ","
                  )} ; 
                  `;
    const { state } = await conn.query(sql);
    res.send({ state, message: "insert successfuly" });
  } catch (error) {
    res.send({ state: false, message: error });
  }
});

router.post("/water-target", async (req, res) => {
  try {
    const { startDate, endDate, amount } = req.body;
    let dateList = [];
    let start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    while (start <= end) {
      const date = new Date(start).toISOString();
      const value = `('${date}','${amount}')`;
      dateList = [...dateList, value];
      start += 60 * 60 * 24 * 1000;
    }

    const sql = `INSERT INTO WUnitTarget(Datetime, Target) VALUES ${dateList.join(
      ","
    )} ;`;
    const { state } = await conn.query(sql);
    res.send({ state, message: "insert successfuly" });
  } catch (error) {
    res.send({ state: false, message: error });
  }
});

router.get("/devices", async (req, res) => {
  try {
    const {
      state,
      query: { recordset },
    } = await conn.query(
      "SELECT *, CONVERT(varchar, datetime, 20) AS fdatetime FROM Device_Notification"
    );

    if (!state) return res.send([]);
    return res.send(recordset);
  } catch (err) {
    return res.send([]);
  }
});

router.post("/report", async (req, res) => {
  try {
    const { filter } = req.body;
    let sql = "";

    ["TDB", "DB2", "DB3", "DB4", "DB5"].map((text) => {
      if (filter == "month") {
        sql += ` SELECT *,(ISNULL(OnExpenseEDay,0)+NewExOff) AS ExDay FROM EDayData${text};`;
      } else {
        sql += `  SELECT Month, Year
        ,SUM(OnpeakTarget) AS NewOnpeakTarget
        ,SUM(OffpeakTarget) AS NewOffpeakTarget
        , SUM(Onpeak) AS OnpeakCumulative
        , MAX(NewCumuoffpeak) AS NewCumuoffpeak
        , SUM(total) AS total, SUM(TotalTarget) AS TotalTarget
        , MAX(ExCumulativeOn) AS ExCumulativeOn
        , SUM(NewExOff) AS NewExOff
        , SUM(Onpeak) * 4.1839 AS NewExOn
        , MAX(NewExCumuTotal) AS Extotal
        , MAX(CumuTotal) AS NewUnitTotal
        , MAX(CumuTarget) AS CumuTarget
        ,(SUM(OnpeakTarget) * 4.1839) + (SUM(OffpeakTarget)*2.6037) AS NewExCumuTotal
      FROM dbo.EDayData${text}
      GROUP BY Month, Year ;
        `;
      }
    });

    for (let i = 2; i <= 5; i++) {
      sql += ` SELECT TOP 1 * FROM EUnitDB${i} ORDER BY id DESC;`;
    }

    const {
      state,
      query: { recordsets },
    } = await conn.query(sql);

    const overall = recordsets[0];
    const db2 = recordsets[1];
    const db3 = recordsets[2];
    const db4 = recordsets[3];
    const db5 = recordsets[4];
    const cvpuDB2 = recordsets[5];
    const cvpuDB3 = recordsets[6];
    const cvpuDB4 = recordsets[7];
    const cvpuDB5 = recordsets[8];

    res.send({
      state,
      results: {
        overall,
        db2,
        db3,
        db4,
        db5,
        cvpu: { cvpuDB2, cvpuDB3, cvpuDB4, cvpuDB5 },
      },
    });
  } catch (error) {
    res.send({ state: false, message: error });
  }
});

router.get("/cumulative", async (req, res) => {
  try {
    const sql = `SELECT month,year,SUM(total) OVER(order BY month  ) AS Unitcumulative,SUM(totaltarget) OVER(order BY month  ) AS Targetcumulative,DB
                  FROM EDataJoinMonthTotalDB;
                  SELECT month,year,SUM(ActualUnit) OVER(order BY month  ) AS Unitcumulative,SUM(Target) OVER(order BY month  ) AS Targetcumulative
                  FROM WFullJoinDataMonth;`;
    const {
      state,
      query: { recordsets },
    } = await conn.query(sql);

    res.send({ state, recordsets });
  } catch (error) {
    console.error(error);
    res.send({ state: false, message: error });
  }
});

router.get("/planning", async (req, res) => {
  try {
    const sql = ` SELECT (OnpeakTarget+OffpeakTarget) AS TotalTarget, CONVERT(varchar, datetime, 20) AS fdatetime FROM EUnitTargetDB2 ORDER BY DateTime;
                  SELECT (OnpeakTarget+OffpeakTarget) AS TotalTarget, CONVERT(varchar, datetime, 20) AS fdatetime FROM EUnitTargetDB3 ORDER BY DateTime;
                  SELECT (OnpeakTarget+OffpeakTarget) AS TotalTarget, CONVERT(varchar, datetime, 20) AS fdatetime FROM EUnitTargetDB4 ORDER BY DateTime;
                  SELECT (OnpeakTarget+OffpeakTarget) AS TotalTarget, CONVERT(varchar, datetime, 20) AS fdatetime FROM EUnitTargetDB5 ORDER BY DateTime;
                  SELECT Target, CONVERT(varchar, datetime, 20) AS fdatetime FROM WUnitTarget ORDER BY DateTime; `;
    const {
      state,
      query: { recordsets },
    } = await conn.query(sql);

    const db2 = recordsets[0];
    const db3 = recordsets[1];
    const db4 = recordsets[2];
    const db5 = recordsets[3];
    const TargetWater = recordsets[4];

    res.send({
      state,
      results: { db2, db3, db4, db5, TargetWater },
    });
  } catch (error) {
    console.error(error);
    res.send({ state: false, message: error });
  }
});

router.post("/delete-target", async (req, res) => {
  try {
    const { Date, Delete } = req.body;
    let sql = "";
    if (Delete === "electric") {
      sql += `  DELETE FROM EUnitTargetDB2 WHERE CONVERT(VARCHAR, DateTime , 120) LIKE '${Date}%';
                  DELETE FROM EUnitTargetDB3 WHERE CONVERT(VARCHAR, DateTime , 120) LIKE '${Date}%';
                  DELETE FROM EUnitTargetDB4 WHERE CONVERT(VARCHAR, DateTime , 120) LIKE '${Date}%';
                  DELETE FROM EUnitTargetDB5 WHERE CONVERT(VARCHAR, DateTime , 120) LIKE '${Date}%';`;
    } else {
      sql += `DELETE FROM WUnitTarget WHERE CONVERT(VARCHAR, DateTime , 120) LIKE '${Date}%';`;
    }
    const {
      state,
      query: { recordsets },
    } = await conn.query(sql);
    res.send({ state, message: "Delete successfully" });
  } catch (error) {
    res.send({ state: false, message: error });
  }
});

router.post("/checklogin", (req, res) => {
  const { username, password: passwordIn } = req.body;
  conn
    .query(`SELECT * FROM accounts WHERE username='${username}'`)
    .then(({ state, query: { recordset } }) => {
      if (!state) return res.send({ state });
      if (recordset.length === 0) return res.send({ state: false });
      const [{ name, password }] = recordset;
      // res.send({ state: true, name, isLoggedIn: true });
      bcrypt
        .compare(passwordIn, password)
        .then((state) => {
          const isLoggedIn = state;
          req.session = { ...req.session, isLoggedIn, name };
          res.send({ state, name, isLoggedIn });
        })
        .catch((err) => {
          req.session = null;
          res.send({ state: false });
        });
    });
});

module.exports = router;
