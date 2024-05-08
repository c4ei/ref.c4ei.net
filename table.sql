CREATE TABLE `parties` (
	`idx` INT(11) NOT NULL AUTO_INCREMENT,
	`partyName` VARCHAR(255) NOT NULL COLLATE 'utf8_unicode_ci',
	`userIdx` INT(11) NOT NULL,
	`regdate` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`modidate` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`idx`) USING BTREE,
	INDEX `userIdx` (`userIdx`) USING BTREE,
	CONSTRAINT `parties_ibfk_1` FOREIGN KEY (`userIdx`) REFERENCES `buddy`.`users` (`userIdx`) ON UPDATE RESTRICT ON DELETE RESTRICT
)
COLLATE='utf8_unicode_ci'
ENGINE=InnoDB
;
CREATE TABLE `pointlog` (
	`pidx` BIGINT(20) NOT NULL AUTO_INCREMENT,
	`userIdx` INT(11) NOT NULL,
	`point` INT(11) NOT NULL DEFAULT '0',
	`regdate` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`regip` VARCHAR(15) NULL DEFAULT '' COLLATE 'utf8_unicode_ci',
	`memo` VARCHAR(250) NULL COLLATE 'utf8_unicode_ci',
	PRIMARY KEY (`pidx`) USING BTREE,
	INDEX `userIdx` (`userIdx`) USING BTREE
)
COLLATE='utf8_unicode_ci'
ENGINE=InnoDB
AUTO_INCREMENT=17
;
CREATE TABLE `sendlog` (
	`tidx` BIGINT(20) NOT NULL AUTO_INCREMENT,
	`userIdx` BIGINT(20) NULL,
	`fromAddr` VARCHAR(67) NOT NULL COLLATE 'utf8_unicode_ci',
	`fromAmt` VARCHAR(37) NOT NULL COLLATE 'utf8_unicode_ci',
	`toAddr` VARCHAR(67) NOT NULL COLLATE 'utf8_unicode_ci',
	`toAmt` VARCHAR(37) NULL COLLATE 'utf8_unicode_ci',
	`sendAmt` VARCHAR(37) NOT NULL COLLATE 'utf8_unicode_ci',
	`successYN` CHAR(1) NOT NULL DEFAULT 'N' COLLATE 'utf8_unicode_ci',
	`regdate` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`regip` VARCHAR(15) NULL DEFAULT '' COLLATE 'utf8_unicode_ci',
	`blockNumber` BIGINT(20) NULL DEFAULT '0',
	`contractAddress` VARCHAR(67) NULL COLLATE 'utf8_unicode_ci',
	`blockHash` VARCHAR(67) NULL COLLATE 'utf8_unicode_ci',
	`transactionHash` VARCHAR(67) NULL COLLATE 'utf8_unicode_ci',
	`last_reg` DATETIME NULL,
	`memo` VARCHAR(250) NULL COLLATE 'utf8_unicode_ci',
	PRIMARY KEY (`tidx`) USING BTREE,
	INDEX `idxAddr` (`fromAddr`, `toAddr`) USING BTREE
)
COLLATE='utf8_unicode_ci'
ENGINE=InnoDB
;
CREATE TABLE `users` (
	`userIdx` INT(11) NOT NULL AUTO_INCREMENT,
	`email` VARCHAR(150) NOT NULL COLLATE 'utf8_unicode_ci',
	`password` VARCHAR(255) NOT NULL COLLATE 'utf8_unicode_ci',
	`reqAAH_ingYN` VARCHAR(1) NOT NULL DEFAULT 'N' COLLATE 'utf8_unicode_ci',
	`loginCnt` BIGINT(20) NOT NULL DEFAULT '0' COMMENT 'loginCntPerDay+1',
	`pub_key` VARCHAR(63) NULL COLLATE 'utf8_unicode_ci',
	`pri_key` VARCHAR(250) NULL COLLATE 'utf8_unicode_ci',
	`seed` VARCHAR(250) NULL COLLATE 'utf8_unicode_ci',
	`aah_balance` VARCHAR(40) NULL DEFAULT '0' COLLATE 'utf8_unicode_ci',
	`regip` VARCHAR(30) NULL COLLATE 'utf8_unicode_ci',
	`regdate` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`last_reg` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`last_ip` VARCHAR(30) NULL COLLATE 'utf8_unicode_ci',
	`point` BIGINT(20) NOT NULL DEFAULT '100',
	`google_id` VARCHAR(60) NOT NULL DEFAULT '0' COLLATE 'utf8_unicode_ci',
	`google_token` VARCHAR(300) NULL COLLATE 'utf8_unicode_ci',
	`reffer_id` INT(11) NULL DEFAULT '0',
	`reffer_cnt` INT(11) NULL DEFAULT '0',
	PRIMARY KEY (`email`) USING BTREE,
	UNIQUE INDEX `userIdx` (`userIdx`) USING BTREE
)
COLLATE='utf8_unicode_ci'
ENGINE=InnoDB
AUTO_INCREMENT=26
;
