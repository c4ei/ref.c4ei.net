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
    // let [rows, fields] = await connection.query(strSQL);
    let rows = await connection.query(strSQL);
    // console.log(rows);
    // console.log(strSQL);
    connection.release();
    return rows[0];
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
    if (!req.session.email) {
        res.redirect('/login');
    } else {
        // res.sendFile(STATIC_PATH + '/index.html')
        let _email = req.session.email;
        let _userIdx = req.session.userIdx;
        res.render('mining', { email:_email , userIdx:_userIdx });
    }
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
    // console.log(result[0].length +" : result[0].length");
    if(result.length>0){
        if(!(await bcrypt.compare(password, result[0].password))){
            return res.status(401).send('EMAIL 또는 비밀번호가 올바르지 않습니다.');
        }
    }else{
        // console.log(result.length +" : result.length");
        return res.status(401).send('회원가입을 먼저 하세요.');
    }
    
    req.session.email = email;
    req.session.userIdx = result[0].userIdx;
    // res.redirect('/invite');
    res.redirect('/');
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
        console.log(email + 'signup 새로운 사용자가 추가되었습니다.');
        await fn_makeAddress(email);
        
        req.session.email = email; // 사용자 정보를 세션에 추가하여 로그인 상태로 설정
        let _userIdx = await fn_getIdFromEmail(email);
        req.session.userIdx = _userIdx;
        let _memo1 = "SELF 가입";
        await fn_setPontLog(_userIdx, 100, _memo1, user_ip);
        // await fn_setPontLogByEmail(email, 100, _memo1, user_ip);
        res.redirect('/invite');
    }catch(e){
        console.log(sql);
    }
});

app.get('/invite', async (req, res) => {
    if (!req.session.email) {
        return res.status(401).send('로그인이 필요합니다.');
    }

    const email = req.session.email;
    const fid = req.session.userIdx;
    const inviteCode = shortid.generate();
    // let ref_id = await fn_getIdFromEmail(fid);
    const inviteLink = `${process.env.FRONTEND_URL}/join?code=${inviteCode}&fid=${fid}`;
    res.send(inviteLink);
});

// https://tel3.c4ei.net/join?code=5FiuDQx5b&fid=1
app.get('/join', (req, res) => {
    const { code, fid, resend } = req.query;
    if (!code) {
        return res.status(400).send('초대 코드가 필요합니다.');
    }
    let _resend = resend;
    if(_resend==undefined){
        _resend ="N";
    }
    res.render('join', { code , fid:fid , _resend:_resend });
});

app.post('/joinok', async (req, res) => {
    const { code, email, password, fid } = req.body;
    if (!code || !email || !password || !fid) {
        return res.status(400).send('코드, EMAIL, 비밀번호가 필요합니다.');
    }
    let reg_idx = await fn_getIdFromEmail(email);
    if(reg_idx>0){
        //이미 가입된 email 입니다.
        let resend_link = `${process.env.FRONTEND_URL}/join?code=${code}&fid=${fid}&resend=Y`;
        res.redirect(resend_link);
        return;
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    var user_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
    let sql = "INSERT INTO users (email , password , point ,regip, reffer_id) values ('"+email+"','"+hashedPassword+"' , '200','"+user_ip+"', '"+fid+"') ";
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
        let sql1 = "update users set last_reg=now(), point=point+100, reffer_cnt=reffer_cnt+1 where userIdx = '"+fid+"' ";
        try{ await saveDB(sql1); } catch(e){ console.log("추천인 보상 " + sql1); }
        let _memo2 = email +" 의 추천인 가입 ";
        await fn_setPontLog(fid,100,_memo2,user_ip);
    } catch(e) {
        console.log(sql);
    }

    res.redirect('/invite');
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


// 적립 요청 처리
// 데이터베이스 시뮬레이션용 변수
// let accumulatedPoints = 0;
app.post('/accumulate', (req, res) => {
    const { MiningQty , userIdx , email } = req.body;
    
    // 여기서는 단순히 적립된 포인트를 누적하고 로그로 출력합니다.
    // accumulatedPoints += count;
    console.log('적립된 포인트: %s / %s / %s', MiningQty , userIdx , email);
    
    res.sendStatus(200);
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

async function fn_getmyaddr(myid){
    let sql = "SELECT user_id, address, user_name FROM users WHERE user_id ='"+myid+"'";
    let result = sync_connection.query(sql);
    if(result.length>0){
        let address = result[0].address;
        return address;
    }else{
        return "no address";
    }
}

async function fn_myaddress(myid, myname){
    let sql0 = "SELECT count(user_id) as Cnt FROM users WHERE user_id ='"+myid+"'";
    let result0 = sync_connection.query(sql0);
    let _Cnt = result0[0].Cnt;
    if(_Cnt > 0)
    {
        let sql = "SELECT user_id, address, user_name FROM users WHERE user_id ='"+myid+"'";
        // console.log(sql);
        let result = sync_connection.query(sql);
            // console.log(result.length +":result.length");
        let user_id = result[0].user_id;
        let address = result[0].address;
        let user_name = result[0].user_name;
        return address;
    } else {
        let sql1 = "SELECT idx,address from address WHERE useYN ='Y' AND mappingYN='N' ORDER BY idx LIMIT 1";
        let result1 = sync_connection.query(sql1);
        if(result1.length>0){
            let addr_idx = result1[0].idx;
            let addr_address = result1[0].address;
            try{
                let sql2 = "insert into users (user_id, address, user_name)";
                sql2 = sql2 + " values ('"+myid+"', '"+addr_address+"', '"+myname+"')";
                let result2 = sync_connection.query(sql2);
                try{
                    setImportAah(addr_address);
                }catch(e){
                    console.log("307 : setImportAah : "+e);
                }
            }catch(e){
                console.log(sql2);
            }
            // try{
            //     let sql3 = "update address set user_id='"+myid+"',mappingYN='Y',last_reg=now() where idx='"+addr_idx+"'";
            //     let result3 = sync_connection.query(sql3);
            // }catch(e){
            //     console.log(sql3);
            // }
            return addr_address;
        } else {
            // event end 2000 member end
            return "end event";
        }
    }
}

async function setImportAah(aah_addr){
    let sql1 = "SELECT privateKey from address WHERE address='"+aah_addr+"'"; // idx,address,privateKey
    let result = sync_connection.query(sql1);
    let privateKey = result[0].privateKey;
    try {
        if(privateKey!=''){
            await web3.personal.importRawKey(privateKey , process.env.AAH_ADDR_PWD, function(error, result) {
                return result;
            });
        }
    } catch(e){
        console.log(e);
    }
}

async function getBalanceAah(aah_addr){
    var wallet_balance = await web3.eth.getBalance(aah_addr, function(error, result) {
        wallet_balance = web3.utils.fromWei(result, "ether");
        return wallet_balance;
    });
}

async function fn_sendMining(ctx, send_addr, rcv_addr, rcv_amt, chatId, fromId){
    let sqls1 = "update users set reqAAH_ingYN='Y' WHERE user_Id ='"+fromId+"'";
    let result1 = sync_connection.query(sqls1);

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
                fn_send_tx_log(fromId, send_addr, rcv_addr, rcv_amt, receipt.blockNumber, receipt.contractAddress, receipt.blockHash, receipt.transactionHash,"AAH_MINING");
                web3.eth.getBalance(rcv_addr, function(error, result) {
                    let wallet_balance = web3.utils.fromWei(result, "ether") +" AAH";
                    // i18n.__('mining_lang_send_mining_ok_aah') // "#### AAH_MINING 발송 ####\n"+ rcv_addr +" 로\n"+rcv_amt+" AAH가 발송되었습니다.\n내 잔고 : "+ wallet_balance+"\ntransactionHash : "+receipt.transactionHash
                    let _hash = receipt.transactionHash;
                    fn_sendMessage(ctx, chatId, i18n.__('mining_lang_send_mining_ok_aah',{rcv_addr ,rcv_amt ,wallet_balance ,_hash ,_hash }) , 'html');
                    let sqls2 = "update users set reqAAH_ingYN='N' WHERE user_Id ='"+fromId+"'";
                    let result2 = sync_connection.query(sqls2);
                });
            });
        }catch(e){
            // i18n.__('mining_lang_send_mining_failure_aah') //#### AAH_MINING 발송 ####\n채굴중 문제가 발생 하였습니다.
            fn_sendMessage(ctx, chatId, i18n.__('mining_lang_send_mining_failure_aah'));
        }
    }
}

async function fn_sendTr(ctx, send_addr, rcv_addr, rcv_amt, chatId, fromId){
    if (await fn_unlockAccount(send_addr))
    {
        web3.eth.sendTransaction({
            from: send_addr,
            to: rcv_addr,
            value: web3.utils.toWei(rcv_amt,'ether'),
            gas: 300000
        }).
        once('sent', function(payload){ console.log(getCurTimestamp()+' ###   user sent ###'); })
        .then(function(receipt){
            fn_send_tx_log(fromId, send_addr, rcv_addr, rcv_amt, receipt.blockNumber, receipt.contractAddress, receipt.blockHash, receipt.transactionHash,"AAH");
            web3.eth.getBalance(send_addr, function(error, result) {
                let wallet_balance = web3.utils.fromWei(result, "ether") +" AAH";
                let _hash = receipt.transactionHash;
                fn_sendMessage(ctx, chatId, i18n.__('mining_lang_send_user_ok_aah',{rcv_addr ,rcv_amt ,wallet_balance ,_hash ,_hash }) , 'html');
            });
        });
    }
}

async function fn_unlockAccount(addr){
    let rtn_result = false;
    // console.log(addr +" / 402 : "+process.env.AAH_ADDR_PWD);
    await web3.eth.personal.unlockAccount(addr, process.env.AAH_ADDR_PWD, 500).then(function (result) {
      rtn_result = result;
    //   console.log('#### 407 #### fn_unlockAccount result :' + result);
    });
    return await rtn_result;
}

async function fn_send_tx_log(fromId, send_addr, rcv_addr, rcv_amt, blockNumber,contractAddress,blockHash,transactionHash, memo ){
    let strsql ="insert into sendlog (`emailx`,`fromAddr`,`toAddr`,`toAmt`,`blockNumber`, `contractAddress` ,`blockHash`,`transactionHash`,`memo`)";
    strsql =strsql + " values ('"+fromId+"','"+send_addr+"','"+rcv_addr+"', '"+rcv_amt+"','"+blockNumber+"','"+contractAddress+"','"+blockHash+"','"+transactionHash+"','"+memo+"')";
    // console.log(strsql);
    let result = sync_connection.query(strsql);
}

function getAddressCheck(user_address){
    //########## address check start ##########
    let addr_result     = Web3.utils.isAddress(user_address);
    // if(!addr_result){}
    return addr_result;
}
  
function get_users_cnt(){
    let sql = "SELECT count(user_id) as cnt FROM users "
    let result = sync_connection.query(sql);
    let cnt = result[0].cnt;
    return cnt;
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

// fn_makeAddress();
