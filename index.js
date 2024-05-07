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

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).send('EMAIL과 비밀번호를 모두 입력해주세요.');
    }
    let sql = "SELECT * FROM users WHERE email = '"+email+"'";
    let result = await loadDB(sql);
    console.log(result[0].length +" : result[0].length");
    if(result[0].length>0){
        console.log(password +" : password");
        console.log(result[0].password +" : result.password");
        if(!(await bcrypt.compare(password, result[0].password))){
            return res.status(401).send('EMAIL 또는 비밀번호가 올바르지 않습니다.');
        }
    }else{
        return res.status(401).send('회원가입을 먼저 하세요.');
    }
    
    req.session.email = email;
    res.redirect('/invite');
    // db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    //     if (err) throw err;

    //     if (results.length === 0 || !(await bcrypt.compare(password, results[0].password))) {
    //         return res.status(401).send('EMAIL 또는 비밀번호가 올바르지 않습니다.');
    //     }

    //     req.session.email = email;
    //     res.redirect('/invite');
    // });
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).send('EMAIL과 비밀번호를 모두 입력해주세요.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { email, password: hashedPassword };
    var user_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
    let sql = "INSERT INTO users (email , password ,regip) values ('"+email+"','"+hashedPassword+"','"+user_ip+"') ";
    try{
        await saveDB(sql);
        console.log('새로운 사용자가 추가되었습니다.');
        await fn_makeAddress(email);

        // 사용자 정보를 세션에 추가하여 로그인 상태로 설정
        req.session.email = email;

        res.redirect('/invite');
    }catch(e){
        console.log(sql);
    }
    
    // db.query('INSERT INTO users SET ?', newUser, (err, result) => {
    //     if (err) throw err;
    //     console.log('새로운 사용자가 추가되었습니다.');
    //     fn_makeAddress(email)

    //     // 사용자 정보를 세션에 추가하여 로그인 상태로 설정
    //     req.session.email = email;

    //     res.redirect('/invite');
    // });
});

app.get('/invite', (req, res) => {
    if (!req.session.email) {
        return res.status(401).send('로그인이 필요합니다.');
    }

    const email = req.session.email;
    const inviteCode = shortid.generate();
    const inviteLink = `${process.env.FRONTEND_URL}/join?code=${inviteCode}&email=${email}`;
    res.send(inviteLink);
});

// https://tel3.c4ei.net/join?code=5FiuDQx5b&email=c4ei
app.get('/join', (req, res) => {
    const { code, email } = req.query;
    if (!code) {
        return res.status(400).send('초대 코드가 필요합니다.');
    }
    res.render('join', { code , fid:email });
});

app.get('/joinok', (req, res) => {
    const { code, email, password } = req.query;
    if (!code || !email || !password) {
        return res.status(400).send('코드, EMAIL, 비밀번호가 필요합니다.');
    }

    // 초대 코드를 확인하고, 맞는 경우 사용자를 등록하고 파티에 추가합니다.
    const inviteLink = inviteLinks[email];
    if (inviteLink && inviteLink.includes(code)) {
        // 초대 링크가 올바른 경우 사용자를 등록하고 파티에 추가하는 로직을 구현합니다.
        const newUser = { email, password };
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
    if (!req.session.email || !partyName) {
        return res.status(400).send('파티 이름과 로그인이 필요합니다.');
    }

    const email = req.session.email;
    const newParty = { partyName, email };
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
