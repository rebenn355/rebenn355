<?php
require 'config.php';session_start();header('Content-Type: application/json');
$a=$_GET['a']??'';$in=json_decode(file_get_contents('php://input'),true)?:[];$u=$_SESSION['u']??null;
function out($d,$c=200){http_response_code($c);echo json_encode($d);exit;}
function need($r=null){global $u;if(!$u)out(['error'=>'Belum login'],401);if($r&&$u['role']!==$r)out(['error'=>'Akses ditolak'],403);}
try{$p=db();switch($a){
case 'login':$s=$p->prepare('SELECT * FROM users WHERE username=?');$s->execute([trim($in['username']??'')]);$r=$s->fetch();
 if(!$r||!password_verify($in['password']??'',$r['password']))out(['error'=>'Username atau password salah'],401);
 if(!$r['active'])out(['error'=>'Akun dinonaktifkan, hubungi Admin'],403);
 $_SESSION['u']=['id'=>$r['id'],'name'=>$r['name'],'role'=>$r['role']];out($_SESSION['u']);
case 'logout':session_destroy();out(['ok'=>1]);
case 'me':need();out($u);
case 'stats':need();
 $t=$p->query("SELECT COALESCE(SUM(total),0) t,COALESCE(SUM(stock),0) s FROM items")->fetch();
 $b=$p->query("SELECT COALESCE(SUM(qty),0) c FROM loans WHERE status='Dipinjam'")->fetch()['c'];
 out(['total'=>(int)$t['t'],'available'=>(int)$t['s'],'borrowed'=>(int)$b,'trx'=>(int)$p->query("SELECT COUNT(*) c FROM loans")->fetch()['c'],
 'recent'=>$p->query("SELECT l.borrower,l.qty,l.status,i.name FROM loans l JOIN items i ON i.id=l.item_id ORDER BY l.id DESC LIMIT 6")->fetchAll(),
 'cats'=>$p->query("SELECT category,SUM(stock) stock,SUM(total) total FROM items GROUP BY category")->fetchAll()]);
case 'items':need();$s=$p->prepare("SELECT * FROM items WHERE code LIKE ? OR name LIKE ? OR category LIKE ? ORDER BY code");$q='%'.($_GET['q']??'').'%';$s->execute([$q,$q,$q]);out($s->fetchAll());
case 'item_save':need('admin');$n=(int)$in['stock'];if($n<0||!trim($in['code']))out(['error'=>'Data tidak valid'],422);
 if(!empty($in['id'])){$o=$p->prepare("SELECT total FROM items WHERE id=?");$o->execute([$in['id']]);$d=$n-$o->fetch()['total'];
  $p->prepare("UPDATE items SET code=?,name=?,category=?,total=?,stock=GREATEST(stock+?,0) WHERE id=?")->execute([$in['code'],$in['name'],$in['category'],$n,$d,$in['id']]);}
 else $p->prepare("INSERT INTO items(code,name,category,stock,total) VALUES(?,?,?,?,?)")->execute([$in['code'],$in['name'],$in['category'],$n,$n]);out(['ok'=>1]);
case 'item_del':need('admin');$c=$p->prepare("SELECT COUNT(*) c FROM loans WHERE item_id=? AND status='Dipinjam'");$c->execute([$in['id']]);
 if($c->fetch()['c'])out(['error'=>'Barang masih dipinjam'],422);
 $p->prepare("DELETE FROM loans WHERE item_id=?")->execute([$in['id']]);$p->prepare("DELETE FROM items WHERE id=?")->execute([$in['id']]);out(['ok'=>1]);
case 'borrow':need();$q=(int)$in['qty'];$p->beginTransaction();
 $s=$p->prepare("SELECT stock FROM items WHERE id=? FOR UPDATE");$s->execute([$in['item_id']]);$r=$s->fetch();
 if(!$r||$q<1||$q>$r['stock']){$p->rollBack();out(['error'=>'Jumlah melebihi stok tersedia'],422);}
 $p->prepare("INSERT INTO loans(borrower,item_id,qty,loan_date,user_id) VALUES(?,?,?,?,?)")->execute([trim($in['borrower']),$in['item_id'],$q,$in['loan_date'],$u['id']]);
 $p->prepare("UPDATE items SET stock=stock-? WHERE id=?")->execute([$q,$in['item_id']]);$p->commit();out(['ok'=>1]);
case 'return':need();$p->beginTransaction();$s=$p->prepare("SELECT * FROM loans WHERE id=? AND status='Dipinjam' FOR UPDATE");$s->execute([$in['id']]);$l=$s->fetch();
 if(!$l){$p->rollBack();out(['error'=>'Transaksi tidak ditemukan'],404);}
 $p->prepare("UPDATE loans SET status='Selesai',return_date=CURDATE() WHERE id=?")->execute([$l['id']]);
 $p->prepare("UPDATE items SET stock=stock+? WHERE id=?")->execute([$l['qty'],$l['item_id']]);$p->commit();out(['ok'=>1]);
case 'loans':need();$w=[];$v=[];if(($_GET['s']??'')=='active')$w[]="l.status='Dipinjam'";if($u['role']=='staff'){$w[]='l.user_id=?';$v[]=$u['id'];}
 $s=$p->prepare("SELECT l.*,i.name,i.code,us.name petugas FROM loans l JOIN items i ON i.id=l.item_id LEFT JOIN users us ON us.id=l.user_id".($w?' WHERE '.implode(' AND ',$w):'')." ORDER BY l.id DESC");$s->execute($v);out($s->fetchAll());
case 'users':need('admin');out($p->query("SELECT id,name,username,role,active,created_at FROM users ORDER BY id")->fetchAll());
case 'user_save':need('admin');
 if(!empty($in['id'])){$p->prepare("UPDATE users SET name=?,username=? WHERE id=? AND role='staff'")->execute([$in['name'],$in['username'],$in['id']]);
  if(!empty($in['password']))$p->prepare("UPDATE users SET password=? WHERE id=? AND role='staff'")->execute([password_hash($in['password'],PASSWORD_DEFAULT),$in['id']]);}
 else{if(strlen($in['password']??'')<6)out(['error'=>'Password minimal 6 karakter'],422);$p->prepare("INSERT INTO users(name,username,password,role) VALUES(?,?,?,'staff')")->execute([$in['name'],$in['username'],password_hash($in['password'],PASSWORD_DEFAULT)]);}out(['ok'=>1]);
case 'user_toggle':need('admin');$p->prepare("UPDATE users SET active=1-active WHERE id=? AND role='staff'")->execute([$in['id']]);out(['ok'=>1]);
default:out(['error'=>'Aksi tidak dikenal'],404);}
}catch(PDOException $e){out(['error'=>$e->getCode()==23000?'Data duplikat (kode/username sudah ada)':'Kesalahan database'],500);}
