const mysql=require('mysql2/promise'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken');
const SECRET=process.env.JWT_SECRET||'ganti-rahasia-ini';
let pool,ready;
const db=()=>pool||(pool=mysql.createPool({host:process.env.DB_HOST,port:+process.env.DB_PORT||3306,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,ssl:process.env.DB_SSL==='false'?undefined:{minVersion:'TLSv1.2'},dateStrings:true,connectionLimit:3}));
const q=(s,a)=>db().query(s,a).then(x=>x[0]);
const bad=(m,c=400)=>{throw Object.assign(new Error(m),{status:c})};
const tx=async fn=>{const c=await db().getConnection();try{await c.beginTransaction();const v=await fn((s,a)=>c.query(s,a).then(x=>x[0]));await c.commit();return v}catch(e){await c.rollback();throw e}finally{c.release()}};

async function init(){
  await q(`CREATE TABLE IF NOT EXISTS users(id INT AUTO_INCREMENT PRIMARY KEY,username VARCHAR(50) NOT NULL UNIQUE,name VARCHAR(100) NOT NULL,password_hash VARCHAR(100) NOT NULL,role ENUM('ADMIN','STAFF') NOT NULL,active TINYINT(1) NOT NULL DEFAULT 1)`);
  await q(`CREATE TABLE IF NOT EXISTS items(id INT AUTO_INCREMENT PRIMARY KEY,code VARCHAR(20) NOT NULL UNIQUE,name VARCHAR(100) NOT NULL,category VARCHAR(50),total INT NOT NULL DEFAULT 0,stock INT NOT NULL DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS loans(id INT AUTO_INCREMENT PRIMARY KEY,borrower VARCHAR(100) NOT NULL,item_id INT NOT NULL,qty INT NOT NULL,loan_date DATE NOT NULL,return_date DATE NULL,status ENUM('DIPINJAM','SELESAI') NOT NULL DEFAULT 'DIPINJAM',staff_id INT NOT NULL)`);
  if(!(await q('SELECT id FROM users LIMIT 1')).length)
    await q('INSERT INTO users(username,name,password_hash,role) VALUES ?',[[['admin','Administrator',bcrypt.hashSync('admin123',10),'ADMIN'],['staff','Staff Lab',bcrypt.hashSync('staff123',10),'STAFF']]]);
  if(!(await q('SELECT id FROM items LIMIT 1')).length){
    const d=[['BR001','Laptop Lenovo','Laptop',5],['BR002','Mouse Logitech','Aksesoris',10],['BR003','Keyboard Mechanical','Aksesoris',8],['BR004','Proyektor Epson','Multimedia',3],['BR005','Monitor LG','Monitor',6],
    ['BR006','Laptop ASUS','Laptop',4],['BR007','Laptop HP','Laptop',4],['BR008','Monitor Dell','Monitor',5],['BR009','Keyboard Logitech','Aksesoris',10],['BR010','Mouse Wireless Razer','Aksesoris',6],
    ['BR011','Router TP-Link','Jaringan',4],['BR012','Switch Cisco 24 Port','Jaringan',2],['BR013','Access Point Ubiquiti','Jaringan',3],['BR014','Kabel LAN 10m','Jaringan',20],['BR015','Kabel HDMI','Kabel',12],
    ['BR016','Webcam Logitech','Aksesoris',5],['BR017','Headset','Aksesoris',8],['BR018','Flashdisk 32GB','Penyimpanan',15],['BR019','Hard Disk Eksternal 1TB','Penyimpanan',4],['BR020','Layar Proyektor','Multimedia',2],
    ['BR021','Speaker Aktif','Multimedia',4],['BR022','Terminal Kabel','Kelistrikan',10],['BR023','Remote Presentasi','Aksesoris',5],['BR024','Printer Canon','Perangkat',2]];
    await q('INSERT INTO items(code,name,category,total,stock) VALUES ?',[d.map(x=>[...x,x[3]])]);
  }
}

const LS='SELECT l.*,i.name item,i.code,u.name staff FROM loans l JOIN items i ON i.id=l.item_id JOIN users u ON u.id=l.staff_id';

module.exports=async(req,res)=>{
  try{
    await(ready||(ready=init().catch(e=>{ready=null;throw e})));
    const url=new URL(req.url,'http://x'),p=url.pathname.replace(/^\/api\/?/,'').split('/').filter(Boolean);
    const m=req.method,b=req.body||{},[r,id,act]=p;

    if(r==='login'&&m==='POST'){
      const [u]=await q('SELECT * FROM users WHERE username=?',[b.username]);
      if(!u||!bcrypt.compareSync(b.password||'',u.password_hash))bad('Username atau password salah',401);
      if(!u.active)bad('Akun dinonaktifkan, hubungi Admin',403);
      const user={id:u.id,name:u.name,role:u.role};
      return res.json({token:jwt.sign(user,SECRET,{expiresIn:'12h'}),user});
    }

    let u;try{u=jwt.verify((req.headers.authorization||'').slice(7),SECRET)}catch{bad('Sesi berakhir, silakan login ulang',401)}
    const [cur]=await q('SELECT active FROM users WHERE id=?',[u.id]);
    if(!cur||!cur.active)bad('Akun tidak aktif',401);
    const A=u.role==='ADMIN',adm=()=>{if(!A)bad('Hanya Admin yang boleh melakukan ini',403)};

    if(r==='dashboard'){
      const [s]=await q('SELECT COALESCE(SUM(total),0) total,COALESCE(SUM(stock),0) tersedia FROM items');
      const [l]=await q("SELECT COUNT(*) transaksi,COALESCE(SUM(CASE WHEN status='DIPINJAM' THEN qty END),0) dipinjam FROM loans");
      return res.json({total:+s.total,tersedia:+s.tersedia,dipinjam:+l.dipinjam,transaksi:+l.transaksi,recent:await q(LS+' ORDER BY l.id DESC LIMIT 8')});
    }

    if(r==='items'){
      if(m==='GET'){const k='%'+(url.searchParams.get('q')||'')+'%';return res.json(await q('SELECT * FROM items WHERE code LIKE ? OR name LIKE ? OR category LIKE ? ORDER BY code',[k,k,k]))}
      adm();
      if(m==='POST'){
        if(!b.code||!b.name||!(b.total>=0))bad('Kode, nama, dan stok wajib diisi');
        await q('INSERT INTO items(code,name,category,total,stock) VALUES(?,?,?,?,?)',[b.code.trim(),b.name.trim(),b.category||'',b.total,b.total]);
        return res.status(201).json({ok:1});
      }
      if(m==='PUT'){
        const [it]=await q('SELECT * FROM items WHERE id=?',[id]);if(!it)bad('Barang tidak ditemukan',404);
        const stock=it.stock+(b.total-it.total);
        if(stock<0)bad('Total stok tidak boleh kurang dari jumlah yang sedang dipinjam');
        await q('UPDATE items SET code=?,name=?,category=?,total=?,stock=? WHERE id=?',[b.code.trim(),b.name.trim(),b.category||'',b.total,stock,id]);
        return res.json({ok:1});
      }
      if(m==='DELETE'){
        const [c]=await q('SELECT COUNT(*) n FROM loans WHERE item_id=?',[id]);
        if(c.n)bad('Barang ini punya riwayat peminjaman, tidak bisa dihapus');
        await q('DELETE FROM items WHERE id=?',[id]);return res.json({ok:1});
      }
    }

    if(r==='loans'){
      if(m==='GET'){
        const st=url.searchParams.get('status');
        if(st==='DIPINJAM')return res.json(await q(LS+" WHERE l.status='DIPINJAM' ORDER BY l.id DESC"));
        return res.json(A?await q(LS+' ORDER BY l.id DESC'):await q(LS+' WHERE l.staff_id=? ORDER BY l.id DESC',[u.id]));
      }
      if(m==='POST'&&!id){
        const qty=+b.qty;
        if(!b.borrower?.trim()||!b.item_id||!(qty>0)||!b.loan_date)bad('Lengkapi semua data peminjaman');
        await tx(async t=>{
          const [it]=await t('SELECT * FROM items WHERE id=? FOR UPDATE',[b.item_id]);
          if(!it)bad('Barang tidak ditemukan',404);
          if(it.stock<qty)bad(`Stok ${it.name} tidak cukup (tersisa ${it.stock})`);
          await t('UPDATE items SET stock=stock-? WHERE id=?',[qty,it.id]);
          await t('INSERT INTO loans(borrower,item_id,qty,loan_date,staff_id) VALUES(?,?,?,?,?)',[b.borrower.trim(),it.id,qty,b.loan_date,u.id]);
        });
        return res.status(201).json({ok:1});
      }
      if(m==='POST'&&act==='return'){
        await tx(async t=>{
          const [l]=await t('SELECT * FROM loans WHERE id=? FOR UPDATE',[id]);
          if(!l)bad('Transaksi tidak ditemukan',404);
          if(l.status==='SELESAI')bad('Transaksi sudah selesai');
          await t('UPDATE items SET stock=stock+? WHERE id=?',[l.qty,l.item_id]);
          await t("UPDATE loans SET status='SELESAI',return_date=CURDATE() WHERE id=?",[id]);
        });
        return res.json({ok:1});
      }
    }

    if(r==='users'){
      adm();
      if(m==='GET')return res.json(await q('SELECT id,username,name,role,active FROM users ORDER BY role,username'));
      if(m==='POST'){
        if(!b.username||!b.name||(b.password||'').length<6)bad('Username, nama, dan password (min. 6 karakter) wajib diisi');
        await q("INSERT INTO users(username,name,password_hash,role) VALUES(?,?,?,'STAFF')",[b.username.trim(),b.name.trim(),bcrypt.hashSync(b.password,10)]);
        return res.status(201).json({ok:1});
      }
      if(m==='PUT'){
        if(+id===u.id&&!b.active)bad('Anda tidak bisa menonaktifkan akun sendiri');
        await q('UPDATE users SET name=?,active=? WHERE id=?',[b.name,b.active?1:0,id]);
        if(b.password){if(b.password.length<6)bad('Password minimal 6 karakter');await q('UPDATE users SET password_hash=? WHERE id=?',[bcrypt.hashSync(b.password,10),id])}
        return res.json({ok:1});
      }
    }
    bad('Endpoint tidak ditemukan',404);
  }catch(e){
    res.status(e.status||(e.code==='ER_DUP_ENTRY'?400:500)).json({error:e.status?e.message:e.code==='ER_DUP_ENTRY'?'Kode atau username sudah dipakai':'Kesalahan server: '+e.message});
  }
};
