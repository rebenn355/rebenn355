<?php
// Jalankan SEKALI via browser: /setup.php lalu HAPUS file ini.
require 'config.php';
try{$x=new PDO("mysql:host={$DB['host']}",$DB['user'],$DB['pass']);$x->exec("CREATE DATABASE IF NOT EXISTS {$DB['name']} CHARACTER SET utf8mb4");}catch(Exception $e){}
$p=db();
$p->exec("CREATE TABLE IF NOT EXISTS users(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100),username VARCHAR(50) UNIQUE,password VARCHAR(255),role ENUM('admin','staff'),active TINYINT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
$p->exec("CREATE TABLE IF NOT EXISTS items(id INT AUTO_INCREMENT PRIMARY KEY,code VARCHAR(20) UNIQUE,name VARCHAR(100),category VARCHAR(50),stock INT,total INT)");
$p->exec("CREATE TABLE IF NOT EXISTS loans(id INT AUTO_INCREMENT PRIMARY KEY,borrower VARCHAR(100),item_id INT,qty INT,loan_date DATE,return_date DATE NULL,status ENUM('Dipinjam','Selesai') DEFAULT 'Dipinjam',user_id INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(item_id) REFERENCES items(id))");
if(!$p->query("SELECT COUNT(*) c FROM users")->fetch()['c']){
 $s=$p->prepare("INSERT INTO users(name,username,password,role) VALUES(?,?,?,?)");
 $s->execute(['Administrator','admin',password_hash('admin123',PASSWORD_DEFAULT),'admin']);
 $s->execute(['Staff Lab','staff',password_hash('staff123',PASSWORD_DEFAULT),'staff']);}
if(!$p->query("SELECT COUNT(*) c FROM items")->fetch()['c']){
 $s=$p->prepare("INSERT INTO items(code,name,category,stock,total) VALUES(?,?,?,?,?)");
 foreach([['BR001','Laptop Lenovo','Laptop',5],['BR002','Mouse Logitech','Aksesoris',10],['BR003','Keyboard Mechanical','Aksesoris',8],['BR004','Proyektor Epson','Presentasi',3],['BR005','Monitor LG','Monitor',6],['BR006','Laptop ASUS ROG','Laptop',4],['BR007','Monitor Dell 24"','Monitor',5],['BR008','Router Cisco','Jaringan',3],['BR009','Switch TP-Link 24 Port','Jaringan',2],['BR010','Kabel LAN 10m','Jaringan',20],['BR011','Webcam Logitech C920','Aksesoris',6],['BR012','Headset Gaming','Aksesoris',7],['BR013','Layar Proyektor','Presentasi',2],['BR014','Access Point Ubiquiti','Jaringan',4],['BR015','Flashdisk 64GB','Penyimpanan',15]] as $r)$s->execute([$r[0],$r[1],$r[2],$r[3],$r[3]]);}
echo "Setup selesai ✅ Admin: admin/admin123 | Staff: staff/staff123. HAPUS setup.php sekarang!";
