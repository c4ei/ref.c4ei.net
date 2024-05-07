const express = require('express');
// const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const session = require('express-session');
const shortid = require('shortid');
const dotenv = require('dotenv');
const cors = require("cors");
const i18n = require('./i18n.js.config');
// i18n.__('settings_command_menu_sett')
const app = express();

dotenv.config();
app.use(express.json());
app.use(cors());
app.options("*", cors());

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));

// MySQL 데이터베이스 연결 설정
const mysql = require("mysql2/promise");
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE
};
const pool = mysql.createPool(dbConfig);
const getConn = async() => {
    return await pool.getConnection(async (conn) => conn);
    // return await pool.getConnection();
}
async function loadDB(strSQL){
    const connection = await getConn();
    // let [rows, fields] = await connection.query(strSQL);
    let rows = await connection.query(strSQL);
    // console.log(rows);
    console.log(strSQL);
    connection.release();
    return rows;
}

async function saveDB(strSQL){
  const connection = await getConn();
  try {
      await connection.beginTransaction();
      await connection.query(strSQL);
      await connection.commit();
      // console.log('success!');
  } catch (err) {
      await connection.rollback();
      // throw err;
      console.log(getCurTimestamp() +' ' + err.sqlMessage);
  } finally {
      connection.release();
  }
}

const _sendAmt="0.0001";
const Web3 = require("web3");
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.AAH_RPC));

const algorithm = process.env.AES_ALG;
const key = process.env.AES_KEY; // key (32 바이트)
const iv = process.env.AES_IV; // Initialization Vector (16 바이트)


app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { userId, password } = req.body;
    if (!userId || !password) {
        return res.status(400).send('사용자 ID와 비밀번호를 모두 입력해주세요.');
    }

    db.query('SELECT * FROM users WHERE userId = ?', [userId], async (err, results) => {
        if (err) throw err;

        if (results.length === 0 || !(await bcrypt.compare(password, results[0].password))) {
            return res.status(401).send('사용자 ID 또는 비밀번호가 올바르지 않습니다.');
        }

        req.session.userId = userId;
        res.redirect('/invite');
    });
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.post('/signup', async (req, res) => {
    const { userId, password } = req.body;
    if (!userId || !password) {
        return res.status(400).send('사용자 ID와 비밀번호를 모두 입력해주세요.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { userId, password: hashedPassword };

    // aah_addr VARCHAR(63)
	// aah_prv_addr VARCHAR(100)
	// aah_balance VARCHAR(40)

    db.query('INSERT INTO users SET ?', newUser, (err, result) => {
        if (err) throw err;
        console.log('새로운 사용자가 추가되었습니다.');

        // 사용자 정보를 세션에 추가하여 로그인 상태로 설정
        req.session.userId = userId;

        res.redirect('/invite');
    });
});

app.get('/invite', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).send('로그인이 필요합니다.');
    }

    const userId = req.session.userId;
    const inviteCode = shortid.generate();
    const inviteLink = `${process.env.FRONTEND_URL}/join?code=${inviteCode}&userId=${userId}`;
    res.send(inviteLink);
});

// https://tel3.c4ei.net/join?code=5FiuDQx5b&userId=c4ei
app.get('/join', (req, res) => {
    const { code, userId } = req.query;
    if (!code) {
        return res.status(400).send('초대 코드가 필요합니다.');
    }
    res.render('join', { code , fid:userId });
});

app.get('/joinok', (req, res) => {
    const { code, userId, password } = req.query;
    if (!code || !userId || !password) {
        return res.status(400).send('코드, 사용자 ID, 비밀번호가 필요합니다.');
    }

    // 초대 코드를 확인하고, 맞는 경우 사용자를 등록하고 파티에 추가합니다.
    const inviteLink = inviteLinks[userId];
    if (inviteLink && inviteLink.includes(code)) {
        // 초대 링크가 올바른 경우 사용자를 등록하고 파티에 추가하는 로직을 구현합니다.
        const newUser = { userId, password };
        db.query('INSERT INTO users SET ?', newUser, (err, result) => {
            if (err) {
                return res.status(500).send('사용자 등록 중 오류가 발생했습니다.');
            }
            // 사용자를 파티에 추가하는 로직을 여기에 추가합니다.
            res.send('가입이 완료되었습니다. 파티에 참여하세요!');
        });
    } else {
        res.status(400).send('올바르지 않은 초대 링크입니다.');
    }
});


app.post('/createParty', (req, res) => {
    const { partyName } = req.body;
    if (!req.session.userId || !partyName) {
        return res.status(400).send('파티 이름과 로그인이 필요합니다.');
    }

    const userId = req.session.userId;
    const newParty = { partyName, userId };
    db.query('INSERT INTO parties SET ?', newParty, (err, result) => {
        if (err) throw err;
        console.log('새로운 파티가 생성되었습니다.');
        res.send('새로운 파티가 생성되었습니다.');
    });
});

function getCurTimestamp() {
    const d = new Date();
  
    return new Date(
      Date.UTC(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        d.getHours(),
        d.getMinutes(),
        d.getSeconds()
      )
    // `toIsoString` returns something like "2017-08-22T08:32:32.847Z"
    // and we want the first part ("2017-08-22")
    ).toISOString().replace('T','_').replace('Z','');
  }

  
app.listen(process.env.PORT, () => {
    console.log(`서버가 http://localhost:${process.env.PORT} 포트에서 실행 중입니다.`);
});

/////////////////// air drop //////////////////////
