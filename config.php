<?php
// Ubah sesuai database hosting kamu
$DB=['host'=>'localhost','name'=>'lab_inventory','user'=>'root','pass'=>''];
function db(){global $DB;static $p;if(!$p)$p=new PDO("mysql:host={$DB['host']};dbname={$DB['name']};charset=utf8mb4",$DB['user'],$DB['pass'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);return $p;}
