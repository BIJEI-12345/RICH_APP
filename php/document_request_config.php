<?php
/**
 * Document request tables: `status` is VARCHAR(30) (replaces former ENUM).
 * New submissions must use this value so they stay aligned with transactions UI ("New").
 */
if (!defined('DOCUMENT_REQUEST_STATUS_NEW')) {
    define('DOCUMENT_REQUEST_STATUS_NEW', 'New');
}
