const express = require('express');
// const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const session = require('express-session');
const shortid = require('shortid');
const dotenv = require('dotenv');
dotenv.config();
const cors = require("cors");
const i18n = require('./i18n.js.config');
// i18n.__('settings_command_menu_sett')
const app = express();
// ######## IP 주소 차단 start ######## yarn add express-ipfilter
app.set('trust proxy', true); // trust proxy 설정은 최상단에 위치
const { IpFilter, IpDeniedError } = require('express-ipfilter');
// 차단, 허용할 특정 IP 목록  // var ips = [['192.168.0.10', '192.168.0.20'], '192.168.0.100']; // 범위 사용 예시
const ips = ['80.66.83.210','103.194.185.58','194.38.23.18','103.212.98.106','45.148.10.80','196.251.73.83','122.136.188.132']; 
app.use(IpFilter(ips, {
  log: false,
  detectIp: (req) => req.ip // trust proxy 설정 후 req.ip 사용 가능
})); // IP 필터 적용

// 에러 핸들러
app.use((err, req, res, _next) => {
  if (err instanceof IpDeniedError) {
    res.status(401).send('Access Denied');
  } else {
    res.status(err.status || 500).end();
  }
});
// ######## 1초에 3번 이상 같은 IP에서 오는 요청 차단 start ######## yarn add express-rate-limit
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 1000, // 1초
  max: 3, // 최대 3회
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip // trust proxy 설정 후 req.ip 사용 가능
});

app.use(limiter); // app.use('/order_cnt', limiter); // 특정 라우트에 적용
//    ######## 1초에 5번 이상 같은 IP에서 오는 요청 차단 end ########
// ######## IP 주소 차단 end ######## 
app.use(express.json());
app.use(cors());
app.options("*", cors());

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));
var path = require('path');
const STATIC_PATH = path.join(__dirname, './public')
// app.use(bodyParser.json());

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
    let rows = await connection.query(strSQL);
    // console.log(strSQL);
    connection.release();
    return rows[0];
    // loadDB 함수 호출
    // loadDB(strSQL)
    // .then(result => {
    //     console.log(result); // 쿼리 결과 출력
    // })
    // .catch(err => {
    //     console.error(err); // 오류 처리
    // });
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

const _sendAmt = "0.0001";
const _regMiningQty = "0.0000001000000";
const Web3 = require("web3");
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.AAH_RPC));

const algorithm = process.env.AES_ALG;
const key = process.env.AES_KEY; // key (32 바이트)
const iv = process.env.AES_IV; // Initialization Vector (16 바이트)


app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

// / 와 mining
app.get('/mining', async (req, res) => {
    res.redirect('/');
});

app.get('/', async (req, res) => {
    if (!req.session.email) {
        res.redirect('/login');
    } else {
        // res.sendFile(STATIC_PATH + '/index.html')
        let _email = req.session.email;
        let _userIdx = req.session.userIdx;
        let _aah_real_balance = "0";
        let _aah_balance = "0";
        let _reffer_id = "0";
        let _reffer_cnt = "0";
        let _pub_key = "";
        let _user_add_addr="";
        let sql = "SELECT userIdx, pub_key, aah_balance, aah_real_balance, reffer_id, reffer_cnt, user_add_addr FROM users WHERE userIdx='"+_userIdx+"'";
        let result = await loadDB(sql);
        // console.log(result.length +" : result.length" + JSON.stringify(result[0]) );
        if(result.length>0){
            _aah_balance = result[0].aah_balance;
            _reffer_id = result[0].reffer_id;
            _reffer_cnt = result[0].reffer_cnt;
            _pub_key = result[0].pub_key;
            _aah_real_balance = result[0].aah_real_balance;
            _user_add_addr = result[0].user_add_addr;
        }
        let sql1 = "SELECT COUNT(midx) cnt FROM mininglog WHERE useridx = '"+_userIdx+"'" ;
        let result1 = await loadDB(sql1);
        let _cnt = result1[0].cnt;
        let _ing_sec = 0;
        if(_cnt>0){
            let sql2 = "SELECT TIMESTAMPDIFF(second, regdate, NOW()) AS sec FROM mininglog WHERE useridx='"+_userIdx+"' AND midx=(SELECT MAX(midx) FROM mininglog WHERE useridx='"+_userIdx+"')";
            let result2 = await loadDB(sql2);
            _ing_sec = result2[0].sec;
        }
        if(_ing_sec>86400){_ing_sec = 86400;}
        
        let sql5 = "SELECT COUNT(party_idx) party_cnt FROM party_member WHERE user_idx = '"+_userIdx+"'" ;
        let result5 = await loadDB(sql5);
        let _party_cnt = result5[0].party_cnt;
        let _party_mem_cnt = 0;
        if(_party_cnt>0){
            let sql6 = "SELECT count(idx) party_mem_cnt FROM party_member WHERE party_idx=(SELECT party_idx FROM party_member WHERE user_idx='"+_userIdx+"')";
            let result6 = await loadDB(sql6);
            _party_mem_cnt = result6[0].party_mem_cnt;
        }

        res.render('mining', { email:_email , userIdx:_userIdx ,aah_balance:_aah_balance, party_mem_cnt:_party_mem_cnt, reffer_id:_reffer_id 
            , reffer_cnt:_reffer_cnt, aah_address : _pub_key , aah_real_balance:_aah_real_balance, ing_sec:_ing_sec, user_add_addr:_user_add_addr});
    }
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    let err_msg= "";
    const { email, password } = req.body;
    if (!email || !password) {
        // return res.status(400).send('EMAIL과 비밀번호를 모두 입력해주세요.');
        err_msg= err_msg +"EMAIL과 비밀번호를 모두 입력해주세요.";
        res.render('error', { err_msg:err_msg});
        return;
    }
    // email = jsfnRepSQLinj(email);
    // password = jsfnRepSQLinj(password);
    let sql = "SELECT *, DATE_FORMAT(loginDailydate, '%y%m%d') AS loginDailyYYYYMMDD, DATE_FORMAT(now(), '%y%m%d') AS curYYYYMMDD FROM users WHERE email = '"+email+"'";
    let result = await loadDB(sql);
    // console.log(result[0].length +" : result[0].length");
    if(result.length>0){
        if(!(await bcrypt.compare(password, result[0].password))){
            // return res.status(401).send('EMAIL 또는 비밀번호가 올바르지 않습니다.');
            err_msg= err_msg +" EMAIL 또는 비밀번호가 올바르지 않습니다.";
            res.render('error', { err_msg:err_msg});
            return;
        }
    }else{
        // console.log(result.length +" : result.length");
        // return res.status(401).send('회원가입을 먼저 하세요.');
        err_msg= err_msg +"회원가입을 먼저 하세요.";
        res.render('error', { err_msg:err_msg});
        return;
    }
    let _aah_real_balance = await getBalanceAah(result[0].pub_key);
    req.session.email = email;
    req.session.userIdx = result[0].userIdx;
    let _loginDailyYYYYMMDD =  result[0].loginDailyYYYYMMDD;
    let _curYYYYMMDD =  result[0].curYYYYMMDD;
    // console.log(_loginDailyYYYYMMDD+" : _loginDailyYYYYMMDD");
    let sql2 = " ";
    if(_loginDailyYYYYMMDD==_curYYYYMMDD){
        sql2 = sql2 + " update users set aah_real_balance='"+_aah_real_balance+"', loginCnt=loginCnt+1 , logindate=now(), reqAAH_ingYN='N' where userIdx='"+result[0].userIdx+"'";
    }else{
        sql2 = sql2 + " update users set aah_real_balance='"+_aah_real_balance+"', loginCnt=loginCnt+1 , loginDailyCnt=loginDailyCnt+1 , logindate=now(), loginDailydate=now() where userIdx='"+result[0].userIdx+"'";
    }
    try{ await saveDB(sql2); }catch(e){ }
    // console.log(sql2);
    res.redirect('/');
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        // return res.status(400).send('EMAIL과 비밀번호를 모두 입력해주세요.');
        err_msg= err_msg +"EMAIL과 비밀번호를 모두 입력해주세요.";
        res.render('error', { err_msg:err_msg});
        return;
    }

    let sql0 = "SELECT count(userIdx) cnt FROM users WHERE email='"+email+"'" ;
    let result0 = await loadDB(sql0);
    let _cnt = result0[0].cnt;
    if(_cnt>0){
        let _errAlert = "<script>alert('이미 존재 하는 EMAIL 입니다.');document.location.href='/signup';</script>";
        // console.log(_errAlert);
        res.send(_errAlert);
        return;
    }
    // email = jsfnRepSQLinj(email);
    // password = jsfnRepSQLinj(password);

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { email, password: hashedPassword };
    var user_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
    let sql = "INSERT INTO users (email , password ,regip) values ('"+email+"','"+hashedPassword+"','"+user_ip+"') ";
    try{
        await saveDB(sql);
        console.log(email + 'signup 새로운 사용자가 추가되었습니다.');
        await fn_makeAddress(email);
        
        req.session.email = email; // 사용자 정보를 세션에 추가하여 로그인 상태로 설정
        let _userIdx = await fn_getIdFromEmail(email);
        req.session.userIdx = _userIdx;
        let _memo1 = "SELF 가입";
        await fn_setPontLog(_userIdx, 100, _memo1, user_ip);
        // 최초 가입시 point 를 주고 log 를 -두시간 전으로 쌓음
        let sql2 = "INSERT INTO mininglog (userIdx, aah_balance, regdate, regip, memo) VALUES ('"+_userIdx+"','"+_regMiningQty+"', DATE_SUB(NOW(), INTERVAL 7205 SECOND),'"+user_ip+"','"+_memo1+"')";
        try{ await saveDB(sql2); }catch(e){ }

        res.redirect('/');
    }catch(e){
        console.log(sql);
    }
});

app.get('/invite', async (req, res) => {
    if (!req.session.email) {
        res.redirect('/login');
        return;// res.status(401).send('로그인이 필요합니다.');
    }

    const _email = req.session.email;
    const _userIdx = req.session.userIdx;
    const inviteCode = shortid.generate();
    // let ref_id = await fn_getIdFromEmail(fid);
    const inviteLink = `${process.env.FRONTEND_URL}/join?code=${inviteCode}&fid=${_userIdx}`;
    // res.send(inviteLink);

    res.render('invite', { inviteLink:inviteLink, email:_email, userIdx:_userIdx });
});

// https://tel3.c4ei.net/join?code=5FiuDQx5b&fid=1
app.get('/join', (req, res) => {
    const { code, fid, resend } = req.query;
    let err_msg="";
    if (!code) {
        // return res.status(400).send('초대 코드가 필요합니다.');
        err_msg= err_msg +"초대 코드가 필요합니다.";
        res.render('error', { err_msg:err_msg});
        return;
    }
    let _resend = resend;
    if(_resend==undefined){
        _resend ="N";
    }
    res.render('join', { code , fid:fid , _resend:_resend });
});

app.post('/joinok', async (req, res) => {
    const { code, email, password, fid } = req.body;
    let err_msg="";
    if (!code || !email || !password || !fid) {
        // return res.status(400).send('코드, EMAIL, 비밀번호가 필요합니다.');
        err_msg= err_msg +"코드, EMAIL, 비밀번호가 필요합니다.";
        res.render('error', { err_msg:err_msg});
        return;
    }
    // code = jsfnRepSQLinj(code);
    // email = jsfnRepSQLinj(email);
    // password = jsfnRepSQLinj(password);
    // fid = jsfnRepSQLinj(fid);

    // let reg_idx = await fn_getIdFromEmail(email);
    // if(reg_idx>0){
    //     //이미 가입된 email 입니다.
    //     let resend_link = `${process.env.FRONTEND_URL}/join?code=${code}&fid=${fid}&resend=Y`;
    //     res.redirect(resend_link);
    //     return;
    // }
    let resend_link = `/join?code=${code}&fid=${fid}`;
    let sql0 = "SELECT count(userIdx) cnt FROM users WHERE email='"+email+"'" ;
    let result0 = await loadDB(sql0);
    let _cnt = result0[0].cnt;
    if(_cnt>0){
        let _errAlert = "<script>alert('이미 존재 하는 EMAIL 입니다.');document.location.href='"+resend_link+"';</script>";
        res.send(_errAlert);
        return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    var user_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
    let sql = "INSERT INTO users (email, password, aah_balance, point, regip, reffer_id) values ('"+email+"','"+hashedPassword+"','"+_regMiningQty+"','200','"+user_ip+"','"+fid+"') ";
    try{
        await saveDB(sql);

        console.log('joinok '+email +'-['+fid+'] 새로운 사용자가 추가되었습니다.');
        await fn_makeAddress(email);
        let _userIdx = await fn_getIdFromEmail(email);
        req.session.email = email; // 사용자 정보를 세션에 추가하여 로그인 상태로 설정
        req.session.userIdx = _userIdx;
        
        let _memo1 = "추천인 존재로 가입";
        await fn_setPontLog(_userIdx, 200, _memo1, user_ip);
        //추천인 보상
        let sql1 = "update users set last_reg=now(), point=point+100, reffer_cnt=reffer_cnt+1 , aah_balance = CAST(aah_balance AS DECIMAL(35,13)) + CAST('"+_regMiningQty+"' AS DECIMAL(35,13)) where userIdx = '"+fid+"' ";
        try{ await saveDB(sql1); } catch(e){ console.log("추천인 보상 " + sql1); }
        let _memo2 = email +" 의 추천인 가입 ";
        await fn_setPontLog(fid,100,_memo2,user_ip);

        // 최초 가입시 point 를 주고 log 를 -두시간 전으로 쌓음
        let sql2 = "INSERT INTO mininglog (userIdx, aah_balance, regdate, regip, memo) VALUES ('"+_userIdx+"','"+_regMiningQty+"', DATE_SUB(NOW(), INTERVAL 7205 SECOND),'"+user_ip+"','"+_memo1+"')";
        try{ await saveDB(sql2); }catch(e){ }
        
        
        // let sql4 = "INSERT INTO mininglog (userIdx, aah_balance, regdate, regip, memo) VALUES ('"+fid+"','"+_regMiningQty+"', DATE_SUB(NOW(), INTERVAL 7205 SECOND),'"+user_ip+"','"+_memo1+"')";
        // try{ await saveDB(sql4); }catch(e){ }
    } catch(e) {
        console.log(sql);
    }

    res.redirect('/');
});

app.get('/makeparty', async (req, res) => {
    if (!req.session.email) {
        res.redirect('/login');
        return;
        //return res.status(401).send('로그인이 필요합니다.');
    }

    const _email = req.session.email;
    const _userIdx = req.session.userIdx;

    let sql1 = "SELECT count(userIdx) cnt FROM parties WHERE userIdx='"+_userIdx+"'" ;
    let result1 = await loadDB(sql1);
    let _cnt = result1[0].cnt;

    let result2 = "nodata";
    let partyName = "";
    if(_cnt>0){
        let sql2 = "SELECT * FROM parties WHERE userIdx='"+_userIdx+"'";
        result2 = await loadDB(sql2);
        if(result2.length>0){
            partyName= result2[0].partyName;
            // userIdx = result2[0].userIdx;
        }
    }

    res.render('makeparty', { email:_email, userIdx:_userIdx ,partyName:partyName, result2:result2 });
});

app.post('/makepartyok', async (req, res) => {
    let err_msg="";
    const { partyName } = req.body;
    if (!req.session.email || !partyName) {
        res.redirect('/login');
        return;
        // return res.status(400).send('파티 이름과 로그인이 필요합니다.');
    }
    let _partyName = jsfnRepSQLinj(partyName);
    // const email = req.session.email;
    let userIdx = req.session.userIdx;
    var user_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;

    let sql1 = "select count(*) cnt from parties where userIdx = '"+userIdx+"'";
    let result1 = await loadDB(sql1);
    let _cnt = result1[0].cnt;
    if(_cnt>0){
        err_msg= err_msg +" 이미 생성한 파티가 있어 더이상 생성 불가능 합니다.";
        res.render('error', { err_msg:err_msg});
        return;
    }else{
        let sql1_1 = "delete from party_member where user_idx='"+userIdx+"'";
        await saveDB(sql1_1);
    }

    let sql2 = "insert into parties (partyName, userIdx, regip) values ('"+_partyName+"','"+userIdx+"','"+user_ip+"')";
    await saveDB(sql2);
    
    let sql3 = "";
    sql3 = sql3 + "select idx FROM parties where partyName='"+_partyName+"'";
    let result3 = await loadDB(sql3);
    let party_idx = 0;
    if(result3.length>0){
        party_idx= result3[0].idx;
    }
    if(party_idx!=0){
        let sql4 = "";
        sql4 = sql4 + "insert into party_member (party_idx, user_idx, regip ) VALUES ('"+party_idx+"','"+userIdx+"','"+user_ip+"')";
        await saveDB(sql4);
    }

    res.redirect('/');
});

// 파티 목록 및 페이징
app.get('/parties', async (req, res) => {
    if (!req.session.email) {
        res.redirect('/login');
        return;
    }
    let userIdx = req.session.userIdx;

    const resultsPerPage = 10;
    const page = req.query.page || 1;
    const offset = (page - 1) * resultsPerPage;
  
    let sql1 = "";
    sql1 = sql1 + " SELECT a.idx, a.partyName, COUNT(b.idx) AS party_mem_cnt ";
    sql1 = sql1 + " FROM parties a , party_member b  "
    sql1 = sql1 + " WHERE a.idx = b.party_idx "
    // 검색 기능 추가
    const searchTerm = req.query.search;
    let searchQuery = '';
    if (searchTerm) {
        sql1 += ` and a.partyName LIKE '%${searchTerm}%'`;
        searchQuery = `&search=${searchTerm}`;
    }
    sql1 = sql1 + " GROUP BY a.idx, a.partyName     ";
    sql1 += ` LIMIT ${offset}, ${resultsPerPage}`;

    let result1 = await loadDB(sql1).catch(err => { console.error(err); });
  
    // 전체 파티 수 계산
    let sql2="SELECT COUNT(*) AS count FROM parties"
    let result2 = await loadDB(sql2);
    const totalCount = result2[0].count;
    const pageCount = Math.ceil(totalCount / resultsPerPage);

    let myP_idx = await jsfn_getMyParty_idx(userIdx);
    let myP_name = await jsfn_getPartyName(myP_idx);

    res.render('parties', { result1: result1, pageCount, searchQuery , myP_idx:myP_idx, myP_name:myP_name});
});

app.post('/partymemberjoinok', async (req, res) => {
    let err_msg = "";
    // 클라이언트로부터 받은 데이터를 req.body를 통해 가져옵니다.
    const partyIndex = req.body.partyIndex;
    let userIdx = req.session.userIdx;
    var user_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;

    let sql1 = "";
    sql1 = sql1 + "select count(idx) p_admin_cnt FROM parties where userIdx='"+userIdx+"'";
    let result1 = await loadDB(sql1);
    let _p_admin_cnt= result1[0].p_admin_cnt;
    if(_p_admin_cnt>0){
        err_msg = err_msg + "파티장은 파티 삭제 후 파티에 가입 가능 합니다.";
        res.render('error', { err_msg:err_msg});
        return;
    }

    let sql3 = "";
    sql3 = sql3 + "select count(party_idx) partyCnt FROM party_member where user_idx='"+userIdx+"'";
    let result3 = await loadDB(sql3);
    let partyCnt = 0;
    if(result3.length>0){
        partyCnt= result3[0].partyCnt;
    }
    if(partyCnt==0){
        let sql4 = "";
        sql4 = sql4 + "insert into party_member (party_idx, user_idx, regip ) VALUES ('"+partyIndex+"','"+userIdx+"','"+user_ip+"')";
        await saveDB(sql4);
    }else{
        err_msg = err_msg + "이미 파티에 가입 되어있습니다.";
        res.render('error', { err_msg:err_msg});
        return;
    }

    res.redirect('/');
});

// 적립 요청 처리
// 데이터베이스 시뮬레이션용 변수
// let accumulatedPoints = 0;
app.post('/accumulate', async (req, res) => {
    const { MiningQty , userIdx , email } = req.body;
    // MiningQty = jsfnRepSQLinj(MiningQty);
    // userIdx = jsfnRepSQLinj(userIdx);
    // email = jsfnRepSQLinj(email);
    let err_msg="";
    let chk_email = req.session.email;
    let chk_userIdx = req.session.userIdx;
    if(userIdx!=chk_userIdx || email!=chk_email){
        err_msg= err_msg +" 세션에 문제가있습니다. 다시 로그인 해 주세요.";
        res.render('error', { err_msg:err_msg});
        return;
    }
    var user_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
    let _err = ""
    let sql1 = "SELECT COUNT(midx) cnt FROM mininglog WHERE useridx='"+userIdx+"'" ;
    let result1 = await loadDB(sql1);
    let _cnt = result1[0].cnt;
    let _ing_sec = 0;
    if(_cnt>0){
        let sql2 = "SELECT TIMESTAMPDIFF(second, regdate, NOW()) AS sec FROM mininglog WHERE useridx='"+userIdx+"' AND midx=(SELECT MAX(midx) FROM mininglog WHERE useridx='"+userIdx+"')";
        let result2 = await loadDB(sql2);
        _ing_sec = result2[0].sec;
    }
    if(_ing_sec>86400){_ing_sec = 86400;}

    if(_cnt==0||_ing_sec>7200){
        let sql2 = "UPDATE users set aah_balance = CAST(aah_balance AS DECIMAL(35,13)) + CAST('"+MiningQty+"' AS DECIMAL(35,13)), last_reg=now(), last_ip='"+user_ip+"' WHERE userIdx = '"+userIdx+"'";
        try{
            await saveDB(sql2);
            console.log('적립된 포인트: %s / %s / %s', MiningQty , userIdx , email);
            let _memo2 = email +" WEB MINING ";
            await fn_setMiningLog(userIdx,MiningQty,_memo2,user_ip);
        } catch(e) {
            console.log(sql2);
        }
    }else{
        _err = _err + email +" : 2 hours not passed";
    }

    res.sendStatus(200);
});

app.post('/sendAAH', async (req, res) => {
    const { f_aah_balance , f_userIdx , f_email } = req.body;
    // MiningQty = jsfnRepSQLinj(MiningQty);
    // userIdx = jsfnRepSQLinj(userIdx);
    // email = jsfnRepSQLinj(email);
    let err_msg="";
    let chk_email = req.session.email;
    let chk_userIdx = req.session.userIdx;
    if(f_userIdx!=chk_userIdx || f_email!=chk_email){
        let _errAlert = "<script>alert('세션에 문제가있습니다. 다시 로그인 해 주세요.');document.location.href='/login';</script>";
        res.send(_errAlert);
        return;
    }

    var user_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
    let sql = "SELECT userIdx, pub_key, aah_balance, aah_real_balance, reqAAH_ingYN, IFNULL(user_add_addr, '') as user_add_addr FROM users WHERE userIdx='"+chk_userIdx+"'";
    let result = await loadDB(sql);
    // console.log(result.length +" : result.length" + JSON.stringify(result[0]) );
    let _aah_balance = f_aah_balance; // from DB value
    let _reqAAH_ingYN = "N";
    let _user_add_addr="";
    if(result.length>0){
        _aah_balance = result[0].aah_balance;
        _pub_key     = result[0].pub_key;
        _reqAAH_ingYN = result[0].reqAAH_ingYN;
        _user_add_addr = result[0].user_add_addr;
    }

    let sql0 = "SELECT count(userIdx) AS cnt FROM sendlog WHERE userIdx ='"+chk_userIdx+"' and memo='AAH_MINING' and regdate > DATE_ADD(now(), INTERVAL -7 HOUR)";
    let result0 = await loadDB(sql0);
    let mining_Cnt = result0[0].cnt;
    // console.log(mining_Cnt+":mining_Cnt");
    if(mining_Cnt==0){
        if (_reqAAH_ingYN=='N'){
            if(_user_add_addr==""){
                err_msg = err_msg + fn_sendMining(process.env.AAH_BANK_ADDRESS, _pub_key, _aah_balance, chk_userIdx, user_ip);
            }else{
                err_msg = err_msg + fn_sendMining(process.env.AAH_BANK_ADDRESS, _user_add_addr, _aah_balance, chk_userIdx, user_ip);
            }
            let _errAlert = "<script>alert('"+_aah_balance+"' AAH 전송이 완료되었습니다.);document.location.href='/mining';</script>";
            res.send(_errAlert);
            return;
        }else{
            let _errAlert = "<script>alert('이미 처리중입니다. (It is already being processed.)');document.location.href='/mining';</script>";
            res.send(_errAlert);
            return;
        }
        // res.sendStatus(200);
    }else{
        let _errAlert = "<script>alert('전송은 8시간 마다 가능 합니다. (Transmission is possible every 8 hours.)');document.location.href='/mining';</script>";
        res.send(_errAlert);
        return;
    }
    // console.log(err_msg);

    res.redirect('/');
    return;
});

app.get('/add_address', async (req, res) => {
    if (!req.session.email) {
        res.redirect('/login');
        return;
        //return res.status(401).send('로그인이 필요합니다.');
    }

    const _email = req.session.email;
    const _userIdx = req.session.userIdx;

    let sql1 = "SELECT user_add_addr FROM users WHERE userIdx='"+_userIdx+"'" ;
    let result1 = await loadDB(sql1);
    let _user_add_addr = result1[0].user_add_addr;

    res.render('add_address', { email:_email, userIdx:_userIdx ,user_add_addr:_user_add_addr });
});

app.post('/add_addrok', async (req, res) => {
    let err_msg="";
    const { user_add_addr } = req.body;
    if (!req.session.email || !user_add_addr) {
        res.redirect('/login');
        return;
    }
    let _user_add_addr = jsfnRepSQLinj(user_add_addr);
    _user_add_addr = await web3.utils.toChecksumAddress(_user_add_addr);
    // const email = req.session.email;
    let userIdx = req.session.userIdx;
    var user_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;

    let sql2 = "update users set user_add_addr='"+_user_add_addr+"',last_ip='"+user_ip+"',last_reg=now() where userIdx='"+userIdx+"'";
    await saveDB(sql2);

    res.redirect('/');
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

// #########################################  
app.listen(process.env.PORT, () => {
    console.log(`서버가 http://localhost:${process.env.PORT} 포트에서 실행 중입니다.`);
});
// #########################################  

async function jsfn_getMyParty_idx(userIdx){
    let sql0 = "select party_idx from party_member userIdx where user_idx = '"+userIdx+"'";
    let result0 = await loadDB(sql0);
    let party_idx = 0;
    if(result0.length>0){
        party_idx= result0[0].party_idx;
    }
    return party_idx;
}

async function jsfn_getPartyName(Pid){
    let sql0 = "SELECT idx, partyName FROM parties where idx = '"+Pid+"'";
    let result0 = await loadDB(sql0);
    let _partyName = "없음";
    if(result0.length>0){
        _partyName= result0[0].partyName;
    }
    return _partyName;
}

async function fn_setMiningLog(userIdx, aah_balance, memo, user_ip){
    let sql = "INSERT INTO mininglog (userIdx, aah_balance, regip, memo) VALUES ('"+userIdx+"','"+aah_balance+"','"+user_ip+"','"+memo+"')";
    try{
        await saveDB(sql);
    }catch(e){
        console.log("fn_setMiningLog\n"+sql);
    }
}

async function fn_getAAHBalance(userIdx){
    let sql = "SELECT userIdx, aah_balance, reffer_id, reffer_cnt FROM users WHERE userIdx='"+userIdx+"'";
    let result = await loadDB(sql);
    // console.log(result.length +" : result.length" + JSON.stringify(result[0]) );
    if(result.length>0){
        _userIdx = result[0].userIdx;
        _aah_balance = result[0].aah_balance;
        _reffer_id = result[0].reffer_id;
        _reffer_cnt = result[0].reffer_cnt;
    }
    // console.log("216 fn_getIdFromEmail -> _userIdx : " + _userIdx);
    return {_userIdx, _aah_balance, _reffer_id, reffer_cnt};
}

async function fn_getIdFromEmail(email){
    let _userIdx = 0;
    let sql = "SELECT userIdx, email FROM users WHERE email='"+email+"'";
    let result = await loadDB(sql);
    // console.log(result.length +" : result.length" + JSON.stringify(result[0]) );
    if(result.length>0){
        _userIdx = result[0].userIdx;
    }
    // console.log("216 fn_getIdFromEmail -> _userIdx : " + _userIdx);
    return _userIdx;
}

async function fn_setPontLog(userIdx, point, memo, user_ip){
    let sql = "INSERT INTO pointlog (userIdx,POINT,regip,memo) VALUES ('"+userIdx+"','"+point+"','"+user_ip+"','"+memo+"')";
    try{
        await saveDB(sql);
    }catch(e){
        console.log("fn_setPontLog\n"+sql);
    }
}

async function fn_setPontLogByEmail(email, point, memo, user_ip){
    let userIdx = await fn_getIdFromEmail(email);
    let sql = "INSERT INTO pointlog (userIdx,POINT,regip,memo) VALUES ('"+userIdx+"','"+point+"','"+user_ip+"','"+memo+"')";
    try{
        await saveDB(sql);
    }catch(e){
        console.log("fn_setPontLogByEmail\n"+sql);
    }
}

/////////////////// air drop //////////////////////

async function getBalanceAah(aah_addr){
    var wallet_balance = await web3.eth.getBalance(aah_addr, async function(error, result) {
        // console.log(wallet_balance+":wallet_balance - getBalanceAah");
    });
    wallet_balance = await web3.utils.fromWei(await wallet_balance, "ether");
    // console.log(await wallet_balance + " : wallet_balance - 602 ");
    return await wallet_balance;
}

async function fn_sendMining(send_addr, rcv_addr, rcv_amt, fromId, user_ip){
    let tr_msg = "";
    let sqls1 = "update users set reqAAH_ingYN='Y' WHERE userIdx ='"+fromId+"'";
    saveDB(sqls1);

    if (await fn_unlockAccount(send_addr))
    {
        try{
            // var user_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
            web3.eth.sendTransaction({
                from: send_addr,
                to: rcv_addr,
                value: web3.utils.toWei(rcv_amt,'ether'),
                gas: 300000
            }).
            once('sent', function(payload){ console.log(getCurTimestamp()+' ###  mining sent ###'+fromId+' / '+rcv_addr+' / '+rcv_amt); })
            .then(function(receipt){
                fn_send_tx_log(fromId, send_addr, rcv_addr, rcv_amt, receipt.blockNumber, receipt.contractAddress, receipt.blockHash, receipt.transactionHash,"AAH_MINING",user_ip);
                web3.eth.getBalance(rcv_addr, function(error, result) {
                    let wallet_balance = web3.utils.fromWei(result, "ether") +" AAH";
                    // i18n.__('mining_lang_send_mining_ok_aah') // "#### AAH_MINING 발송 ####\n"+ rcv_addr +" 로\n"+rcv_amt+" AAH가 발송되었습니다.\n내 잔고 : "+ wallet_balance+"\ntransactionHash : "+receipt.transactionHash
                    let _hash = receipt.transactionHash;
                    tr_msg = tr_msg + rcv_addr +" : rcv_addr / " + rcv_amt +" : rcv_amt / "+ wallet_balance +" : wallet_balance / "+ _hash +" : _hash";
                    // fn_sendMessage(ctx, chatId, i18n.__('mining_lang_send_mining_ok_aah',{rcv_addr ,rcv_amt ,wallet_balance ,_hash ,_hash }) , 'html');
                    let sqls2 = "update users set reqAAH_ingYN='N', aah_balance='0', last_reg=now() WHERE userIdx ='"+fromId+"'";
                    saveDB(sqls2);
                });
            });
        }catch(e){
            // i18n.__('mining_lang_send_mining_failure_aah') //#### AAH_MINING 발송 ####\n채굴중 문제가 발생 하였습니다.
            tr_msg = tr_msg + "" + i18n.__('mining_lang_send_mining_failure_aah');
            console.log("755 : "+e);
        }
    }
    return tr_msg;
}

async function fn_unlockAccount(addr){
    let rtn_result = false;
    // console.log(addr +" / 671 : "+process.env.AAH_ADDR_PWD);
    await web3.eth.personal.unlockAccount(addr, process.env.AAH_ADDR_PWD, 500).then(function (result) {
        rtn_result = result;
        //   console.log('#### 674 #### fn_unlockAccount result :' + result);
    });
    return rtn_result;
}

async function fn_send_tx_log(fromId, send_addr, rcv_addr, rcv_amt, blockNumber,contractAddress,blockHash,transactionHash, memo, user_ip ){
    let strsql ="insert into sendlog (userIdx,`fromAddr`,`fromAmt`,`toAddr`,`toAmt`,`blockNumber`, `contractAddress` ,`blockHash`,`transactionHash`,`memo`,`regip`)";
    strsql =strsql + " values ('"+fromId+"','"+send_addr+"','"+rcv_amt+"','"+rcv_addr+"','"+rcv_amt+"','"+blockNumber+"','"+contractAddress+"','"+blockHash+"','"+transactionHash+"','"+memo+"','"+user_ip+"')";
    // console.log(strsql);
    saveDB(strsql);
}

const crypto = require("crypto");
const bip39 = require("bip39");

function generateSeedPhrases(numPhrases, numWords) {

    const words = ["abandon","ability","able","about","above","absent","absorb","abstract",
    "absurd","abuse","access","accident","account","accuse","achieve","acid","acoustic","acquire","across","act","action","actor","actress","actual","adapt","add","addict","address","adjust","admit","adult","advance","advice","aerobic","affair","afford","afraid","again","age","agent","agree","ahead","aim","air","airport","aisle","alarm","album","alcohol","alert","alien","all","alley","allow","almost","alone","alpha","already","also","alter","always","amateur","amazing","among","amount","amused","analyst","anchor","ancient","anger","angle","angry","animal","ankle","announce","annual","another","answer","antenna",
    "antique","anxiety","any","apart","apology","appear","apple","approve","april","arch","arctic","area","arena","argue","arm","armed","armor","army","around","arrange","arrest","arrive","arrow","art","artefact","artist","artwork","ask","aspect","assault","asset","assist","assume","asthma","athlete","atom","attack","attend","attitude","attract","auction","audit","august","aunt","author","auto","autumn","average","avocado","avoid","awake","aware","away","awesome","awful","awkward","axis","baby","bachelor","bacon","badge","bag","balance","balcony","ball","bamboo","banana","banner","bar","barely","bargain","barrel","base","basic","basket","battle","beach","bean","beauty","because","become","beef","before","begin","behave","behind","believe","below","belt","bench","benefit","best","betray","better","between","beyond","bicycle","bid","bike","bind","biology","bird","birth","bitter","black","blade","blame","blanket","blast","bleak","bless","blind","blood","blossom","blouse","blue","blur","blush","board","boat",
    "body","boil","bomb","bone","bonus","book","boost","border","boring","borrow","boss","bottom","bounce","box","boy","bracket","brain","brand","brass","brave","bread","breeze","brick","bridge","brief","bright","bring","brisk","broccoli","broken","bronze","broom","brother","brown","brush","bubble","buddy","budget","buffalo","build","bulb","bulk","bullet","bundle","bunker","burden","burger","burst","bus","business","busy","butter","buyer","buzz","cabbage","cabin","cable","cactus","cage","cake","call","calm","camera","camp","can","canal","cancel",
    "candy","cannon","canoe","canvas","canyon","capable","capital","captain","car","carbon","card","cargo","carpet","carry","cart","case","cash","casino","castle","casual","cat","catalog","catch","category","cattle","caught","cause","caution","cave","ceiling","celery","cement","census","century","cereal","certain","chair","chalk","champion","change","chaos","chapter","charge","chase","chat","cheap","check","cheese","chef","cherry","chest","chicken","chief","child","chimney","choice","choose","chronic","chuckle","chunk","churn","cigar","cinnamon","circle","citizen","city","civil","claim","clap","clarify","claw","clay","clean","clerk","clever","click","client","cliff","climb","clinic","clip","clock","clog","close","cloth","cloud","clown","club","clump","cluster","clutch","coach","coast","coconut","code","coffee","coil","coin","collect","color",
    "column","combine","come","comfort","comic","common","company","concert","conduct","confirm","congress","connect","consider","control","convince","cook","cool","copper","copy","coral","core","corn","correct","cost","cotton","couch","country","couple","course","cousin","cover","coyote","crack","cradle","craft","cram","crane","crash","crater","crawl","crazy","cream","credit","creek","crew","cricket","crime","crisp","critic","crop","cross","crouch","crowd","crucial","cruel","cruise","crumble","crunch","crush","cry","crystal","cube","culture","cup"
    ,"cupboard","curious","current","curtain","curve","cushion","custom","cute","cycle","dad","damage","damp","dance","danger","daring","dash","daughter","dawn","day","deal","debate","debris","decade","december","decide","decline","decorate","decrease","deer","defense","define","defy","degree","delay","deliver","demand","demise","denial","dentist","deny","depart","depend","deposit","depth","deputy","derive","describe","desert","design","desk","despair","destroy","detail","detect","develop","device","devote","diagram","dial","diamond","diary","dice","diesel","diet","differ","digital","dignity","dilemma","dinner","dinosaur","direct","dirt","disagree","discover","disease","dish","dismiss","disorder","display","distance","divert","divide","divorce","dizzy","doctor","document","dog","doll","dolphin","domain","donate","donkey","donor","door","dose","double","dove","draft","dragon","drama","drastic","draw","dream","dress","drift","drill","drink","drip","drive","drop","drum","dry","duck","dumb",
    "dune","during","dust","dutch","duty","dwarf","dynamic","eager","eagle","early","earn","earth","easily","east","easy","echo","ecology","economy","edge","edit","educate","effort","egg","eight","either","elbow","elder","electric","elegant","element","elephant","elevator","elite","else","embark","embody","embrace","emerge","emotion","employ","empower","empty","enable","enact","end","endless","endorse","enemy","energy","enforce","engage","engine","enhance","enjoy","enlist","enough","enrich","enroll","ensure","enter","entire","entry","envelope","episode","equal","equip","era","erase","erode","erosion","error","erupt","escape","essay","essence","estate","eternal","ethics","evidence","evil","evoke","evolve","exact","example","excess","exchange","excite","exclude","excuse","execute","exercise","exhaust","exhibit","exile","exist","exit","exotic","expand","expect","expire","explain","expose","express","extend","extra","eye","eyebrow","fabric","face","faculty","fade","faint","faith","fall","false","fame","family","famous","fan","fancy","fantasy","farm","fashion","fat","fatal","father","fatigue","fault","favorite","feature","february","federal","fee","feed","feel","female","fence","festival","fetch","fever","few","fiber","fiction","field","figure","file","film","filter","final","find","fine","finger",
    "finish","fire","firm","first","fiscal","fish","fit","fitness","fix","flag","flame","flash","flat","flavor","flee","flight","flip","float","flock","floor","flower","fluid","flush","fly","foam","focus","fog","foil","fold","follow","food","foot","force","forest","forget","fork","fortune","forum","forward","fossil","foster","found","fox","fragile","frame","frequent","fresh","friend","fringe","frog","front","frost","frown","frozen","fruit","fuel","fun","funny","furnace","fury","future","gadget","gain","galaxy","gallery","game","gap","garage","garbage","garden","garlic","garment","gas","gasp","gate","gather","gauge","gaze","general","genius","genre","gentle","genuine","gesture","ghost","giant","gift","giggle","ginger","giraffe","girl","give","glad","glance","glare","glass","glide","glimpse","globe","gloom","glory","glove","glow","glue","goat",
    "goddess","gold","good","goose","gorilla","gospel","gossip","govern","gown","grab","grace","grain","grant","grape","grass","gravity","great","green","grid","grief","grit","grocery","group","grow","grunt","guard","guess","guide","guilt","guitar","gun","gym","habit","hair","half","hammer","hamster","hand","happy","harbor","hard","harsh","harvest","hat","have","hawk","hazard","head","health","heart","heavy","hedgehog","height","hello","helmet","help","hen","hero","hidden","high","hill","hint","hip","hire","history","hobby","hockey","hold","hole","holiday","hollow","home","honey","hood","hope","horn","horror","horse","hospital","host","hotel","hour","hover","hub","huge","human","humble","humor","hundred","hungry","hunt","hurdle","hurry","hurt","husband","hybrid","ice","icon","idea","identify","idle","ignore","ill","illegal","illness","image","imitate","immense","immune","impact","impose","improve","impulse","inch","include","income","increase","index","indicate","indoor","industry","infant","inflict","inform","inhale","inherit","initial","inject","injury","inmate","inner","innocent","input","inquiry","insane","insect","inside","inspire","install","intact","interest","into","invest","invite","involve","iron","island","isolate","issue","item","ivory","jacket","jaguar","jar","jazz","jealous","jeans","jelly","jewel","job","join","joke","journey","joy","judge","juice","jump","jungle","junior","junk","just","kangaroo","keen","keep","ketchup","key","kick",
    "kid","kidney","kind","kingdom","kiss","kit","kitchen","kite","kitten","kiwi","knee","knife","knock","know","lab","label","labor","ladder","lady","lake","lamp","language","laptop","large","later","latin","laugh","laundry","lava","law","lawn","lawsuit","layer","lazy","leader","leaf","learn","leave","lecture","left","leg","legal","legend","leisure","lemon","lend","length","lens","leopard","lesson","letter","level","liar","liberty","library","license","life","lift","light","like","limb","limit","link","lion","liquid","list","little","live","lizard","load","loan","lobster","local","lock","logic","lonely","long","loop","lottery","loud","lounge","love","loyal","lucky","luggage","lumber","lunar","lunch","luxury","lyrics","machine","mad","magic","magnet","maid","mail","main","major","make","mammal","man","manage","mandate","mango","mansion","manual","maple","marble","march","margin","marine","market","marriage","mask","mass","master","match","material","math","matrix","matter","maximum","maze","meadow","mean","measure","meat","mechanic","medal","media","melody","melt","member","memory","mention","menu","mercy","merge","merit","merry","mesh","message","metal","method","middle","midnight","milk","million","mimic","mind","minimum","minor","minute","miracle","mirror","misery","miss","mistake","mix","mixed","mixture","mobile","model","modify","mom","moment","monitor","monkey","monster","month","moon","moral","more","morning","mosquito","mother","motion","motor","mountain","mouse","move","movie","much","muffin","mule","multiply","muscle","museum","mushroom","music","must","mutual","myself","mystery","myth","naive","name","napkin","narrow","nasty","nation","nature","near","neck","need","negative","neglect","neither","nephew","nerve","nest","net","network","neutral",
    "never","news","next","nice","night","noble","noise","nominee","noodle","normal","north","nose","notable","note","nothing","notice","novel","now","nuclear","number","nurse","nut","oak","obey","object","oblige","obscure","observe","obtain","obvious","occur","ocean","october","odor","off","offer","office","often","oil","okay","old","olive","olympic","omit","once","one","onion","online","only","open","opera","opinion","oppose","option","orange","orbit","orchard","order","ordinary","organ","orient","original","orphan","ostrich","other","outdoor","outer","output","outside","oval","oven","over","own","owner","oxygen","oyster","ozone","pact","paddle","page","pair","palace","palm","panda","panel","panic","panther","paper","parade","parent","park","parrot","party","pass","patch","path","patient","patrol","pattern","pause","pave","payment","peace","peanut","pear","peasant","pelican","pen","penalty","pencil","people","pepper","perfect","permit","person","pet","phone","photo","phrase","physical","piano","picnic","picture","piece","pig","pigeon","pill","pilot","pink","pioneer","pipe","pistol","pitch","pizza","place","planet","plastic","plate","play","please","pledge","pluck","plug","plunge","poem","poet","point","polar","pole","police","pond","pony","pool","popular","portion","position","possible","post","potato","pottery",
    "poverty","powder","power","practice","praise","predict","prefer","prepare","present","pretty","prevent","price","pride","primary","print","priority","prison","private","prize","problem","process","produce","profit","program","project","promote","proof","property","prosper","protect","proud","provide","public","pudding","pull","pulp","pulse","pumpkin","punch","pupil","puppy","purchase","purity","purpose","purse","push","put","puzzle","pyramid","quality","quantum","quarter","question","quick","quit","quiz","quote","rabbit","raccoon","race","rack","radar","radio","rail","rain","raise","rally","ramp","ranch","random","range","rapid","rare","rate","rather","raven","raw","razor","ready","real","reason","rebel","rebuild","recall","receive","recipe","record","recycle","reduce","reflect","reform","refuse","region","regret","regular","reject","relax","release","relief","rely","remain","remember","remind","remove","render","renew","rent","reopen","repair","repeat","replace","report","require","rescue","resemble","resist","resource","response","result","retire","retreat","return","reunion","reveal","review","reward","rhythm","rib","ribbon","rice",
    "rich","ride","ridge","rifle","right","rigid","ring","riot","ripple","risk","ritual","rival","river","road","roast","robot","robust","rocket","romance","roof","rookie","room","rose","rotate","rough","round","route","royal","rubber","rude","rug","rule","run","runway","rural","sad","saddle","sadness","safe","sail","salad","salmon","salon","salt","salute","same","sample","sand","satisfy","satoshi","sauce","sausage","save","say","scale","scan","scare","scatter","scene","scheme","school","science","scissors","scorpion","scout","scrap","screen","script","scrub","sea","search","season","seat","second","secret","section","security","seed","seek","segment","select","sell","seminar","senior","sense","sentence","series","service","session","settle","setup","seven","shadow","shaft","shallow","share","shed","shell","sheriff","shield","shift","shine","ship","shiver","shock","shoe","shoot","shop","short","shoulder","shove","shrimp","shrug","shuffle","shy","sibling","sick","side","siege","sight","sign","silent","silk","silly","silver","similar","simple","since","sing","siren","sister","situate","six","size","skate","sketch","ski","skill","skin","skirt","skull","slab","slam","sleep","slender","slice","slide","slight","slim","slogan","slot","slow","slush","small","smart","smile","smoke","smooth","snack","snake","snap",
    "sniff","snow","soap","soccer","social","sock","soda","soft","solar","soldier","solid","solution","solve","someone","song","soon","sorry","sort","soul","sound","soup","source","south","space","spare","spatial","spawn","speak","special","speed","spell","spend","sphere","spice","spider","spike","spin","spirit","split","spoil","sponsor","spoon","sport","spot","spray","spread","spring","spy","square","squeeze","squirrel","stable","stadium","staff","stage","stairs","stamp","stand","start","state","stay","steak","steel","stem","step","stereo","stick","still","sting","stock","stomach","stone","stool","story","stove","strategy","street","strike","strong","struggle","student","stuff","stumble","style","subject","submit","subway","success","such","sudden","suffer","sugar","suggest","suit","summer","sun","sunny","sunset","super","supply","supreme","sure","surface","surge","surprise","surround","survey","suspect","sustain","swallow","swamp","swap","swarm","swear","sweet","swift","swim","swing","switch","sword","symbol","symptom","syrup","system","table","tackle","tag","tail","talent","talk","tank","tape","target","task","taste","tattoo","taxi","teach","team","tell","ten","tenant","tennis","tent","term","test","text","thank","that","theme","then","theory","there","they","thing","this","thought","three","thrive","throw","thumb",
    "thunder","ticket","tide","tiger","tilt","timber","time","tiny","tip","tired","tissue","title","toast","tobacco","today","toddler","toe","together","toilet","token","tomato","tomorrow","tone","tongue","tonight","tool","tooth","top","topic","topple","torch","tornado","tortoise","toss","total","tourist","toward","tower","town","toy","track","trade","traffic","tragic","train","transfer","trap","trash","travel","tray","treat","tree","trend","trial","tribe","trick","trigger","trim","trip","trophy","trouble","truck","true","truly","trumpet","trust","truth","try","tube","tuition","tumble","tuna","tunnel","turkey","turn","turtle","twelve","twenty","twice","twin","twist","two","type","typical","ugly","umbrella","unable","unaware","uncle","uncover","under","undo","unfair","unfold","unhappy","uniform","unique","unit","universe","unknown","unlock","until","unusual","unveil","update","upgrade","uphold","upon","upper","upset","urban","urge","usage","use","used","useful","useless","usual","utility",
    "vacant","vacuum","vague","valid","valley","valve","van","vanish","vapor","various","vast","vault","vehicle","velvet","vendor","venture","venue","verb","verify","version","very","vessel","veteran","viable","vibrant","vicious","victory","video","view","village","vintage","violin","virtual","virus","visa","visit","visual","vital","vivid","vocal","voice","void","volcano","volume","vote","voyage","wage","wagon","wait","walk","wall","walnut","want","warfare","warm","warrior","wash","wasp","waste","water","wave","way","wealth","weapon","wear","weasel","weather","web","wedding","weekend","weird","welcome","west","wet","whale","what","wheat","wheel","when","where","whip","whisper","wide","width","wife","wild","will","win","window","wine","wing","wink","winner","winter","wire","wisdom","wise","wish","witness","wolf","woman","wonder","wood","wool","word","work","world","worry","worth","wrap","wreck","wrestle","wrist","write","wrong",
    "yard","year","yellow","you","young","youth","zebra","zero","zone","zoo"];

  const seedPhrases = [];

  for (let i = 0; i < numPhrases; i++) {
    const seedPhrase = [];

    for (let j = 0; j < numWords; j++) {
      const randomIndex = crypto.randomInt(0, words.length);
      if(j == 0){ seedPhrase.push("\""+words[randomIndex]); }
      else{
        if(j == numWords-1){ 
            seedPhrase.push(words[randomIndex]+"\"");
        }
        else{
            seedPhrase.push(words[randomIndex]);
        }
      }
    }

    seedPhrases.push(seedPhrase.join(" "));
  }

  return seedPhrases;
}

async function fn_makeAddress(email){
    const numPhrases = 1;
    const numWords = 12;
    const seedPhrases = generateSeedPhrases(numPhrases, numWords);
    const seed = seedPhrases[0].replace(/"/g,"");
    const seedBuffer = await bip39.mnemonicToSeed(seed);
    const rootNode = await web3.eth.accounts.privateKeyToAccount("0x" + seedBuffer.slice(0, 32).toString("hex") );
    const pub_key = await rootNode.address.toString();
    // const pri_key = "0x" + seedBuffer.slice(0, 32).toString("hex");
    const pri_key = seedBuffer.slice(0, 32).toString("hex");

    // console.log(pub_key +" : pub_key / " + pri_key +" : pri_key / " + seed +" : seed " );
    // console.log( jsfn_encrypt(pri_key) +" : encrypt_pri_key / " + jsfn_encrypt(seed) +" : encrypt_seed " );
    sql = "";
    sql = sql + " update users set pub_key='"+pub_key+"' , pri_key='"+jsfn_encrypt(pri_key)+"' ,seed='"+jsfn_encrypt(seed)+"' where email = '"+email+"' "
    saveDB(sql);
    try {
        // console.log(pub_key +" : pub_key \n "+pri_key+" : pri_key");
        await web3.personal.importRawKey( String(pri_key) , process.env.AAH_ADDR_PWD, function(error, result) { console.log(result); });
    } catch(e){
        // console.log(e);
    }
}

async function getBalance(address) {
    return web3.eth.getBalance(address);
}

function jsfn_encrypt(text) {
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function jsfn_decrypt(encrypted) {
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function jsfnRepSQLinj(str){
    str = str.replace('\'','`');
    str = str.replace('--','');
    return str;
  }
// fn_makeAddress();
