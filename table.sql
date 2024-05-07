CREATE TABLE `users` (
	`userIdx` INT(11) NOT NULL AUTO_INCREMENT,
	`email` VARCHAR(150) NOT NULL COLLATE 'utf8_unicode_ci',
	`password` VARCHAR(255) NOT NULL COLLATE 'utf8_unicode_ci',
	`reqAAH_ingYN` VARCHAR(1) NOT NULL DEFAULT 'N' COLLATE 'utf8_unicode_ci',
	`loginCnt` BIGINT(20) NOT NULL DEFAULT '0' COMMENT 'loginCntPerDay+1',
	`aah_addr` VARCHAR(63) NULL COLLATE 'utf8_unicode_ci',
	`aah_prv_addr` VARCHAR(100) NULL COLLATE 'utf8_unicode_ci',
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

	PRIMARY KEY (`userIdx`) USING BTREE
)
COLLATE='utf8_unicode_ci'
ENGINE=InnoDB
AUTO_INCREMENT=1
;
CREATE TABLE `parties` (
	`idx` INT(11) NOT NULL AUTO_INCREMENT,
	`partyName` VARCHAR(255) NOT NULL COLLATE 'utf8_unicode_ci',
	`userIdx` INT(11) NOT NULL,
	PRIMARY KEY (`idx`) USING BTREE,
	INDEX `userIdx` (`userIdx`) USING BTREE,
	CONSTRAINT `parties_ibfk_1` FOREIGN KEY (`userIdx`) REFERENCES `buddy`.`users` (`userIdx`) ON UPDATE RESTRICT ON DELETE RESTRICT
)
COLLATE='utf8_unicode_ci'
ENGINE=InnoDB
;
