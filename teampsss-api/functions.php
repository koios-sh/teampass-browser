<?php

/**
 *
 * @package       (api)functions.php
 * @author        Nils Laumaillé <nils@teampass.net>
 * @version       2.1.5
 * @copyright     2009-2019 Nils Laumaillé
 * @license       GNU GPL-3.0
 * @link          https://www.teampass.net
 *
 * 
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

$api_version = "2.1.5";
$_SESSION['CPM'] = 1;
require_once "../includes/config/include.php";
require_once "../sources/main.functions.php";

/**
 * Get IP used
 *
 * @return void
 */
function getIp()
{
    if (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
    } else {
        $headers = $_SERVER;
    }
    if (array_key_exists('X-Forwarded-For', $headers) && filter_var($headers['X-Forwarded-For'], FILTER_VALIDATE_IP)) {
        $the_ip = $headers['X-Forwarded-For'];
    } elseif (array_key_exists('HTTP_X_FORWARDED_FOR', $headers) && filter_var($headers['HTTP_X_FORWARDED_FOR'], FILTER_VALIDATE_IP)) {
        $the_ip = $headers['HTTP_X_FORWARDED_FOR'];
    } else {
        $the_ip = filter_var($_SERVER['REMOTE_ADDR'], FILTER_VALIDATE_IP);
    }
    return $the_ip;
}

/**
 * Is API enabled by admin
 *
 * @return void
 */
function teampassApiEnabled()
{
    teampassConnect();
    $response = DB::queryFirstRow(
        "SELECT `valeur` FROM ".prefix_table("misc")." WHERE type = %s AND intitule = %s",
        "admin",
        "api"
    );
    return $response['valeur'];
}

/**
 * Get list of allowed IPs
 *
 * @return void
 */
function teampassWhitelist()
{
    teampassConnect();
    $apiip_pool = teampassGetIps();
    if (count($apiip_pool) > 0 && array_search(getIp(), $apiip_pool) === false) {
        restError('IPWHITELIST');
    }
}

/**
 * Connect to teampass database
 *
 * @return void
 */
function teampassConnect()
{
    global $server, $user, $pass, $database, $link, $port, $encoding;
    include_once "../includes/config/settings.php";
    include_once '../includes/libraries/Database/Meekrodb/db.class.php';
    $pass = defuse_return_decrypted($pass);
    DB::$host = $server;
    DB::$user = $user;
    DB::$password = $pass;
    DB::$dbName = $database;
    DB::$port = $port;
    DB::$encoding = $encoding;
    DB::$error_handler = true;
    $link = mysqli_connect($server, $user, $pass, $database, $port);
    $link->set_charset($encoding);
}

/**
 * Get list of ips
 *
 * @return void
 */
function teampassGetIps()
{
    $array_of_results = array();
    teampassConnect();
    $response = DB::query("select value from ".prefix_table("api")." WHERE type = %s", "ip");
    foreach ($response as $data) {
        array_push($array_of_results, $data['value']);
    }

    return $array_of_results;
}

/**
 * Get list of api keys
 *
 * @return void
 */
function teampassGetKeys()
{
    teampassConnect();
    $response = array_unique(
        array_merge(
            // DB::queryOneColumn("value", "select * from ".prefix_table("api")." WHERE type = %s", "key"),
            DB::queryOneColumn("user_api_key", "select * from ".prefix_table("users")."")
        )
    );

    // remove none value
    if (($key = array_search('none', $response)) !== false) {
        unset($response[$key]);
    }

    return $response;
}

/**
 * Set header
 *
 * @return void
 */
function restHead()
{
    restOk(array());
}

/**
 * Add new entry to cache table
 *
 * @param  integer $item_id
 * @return void
 */
function addToCacheTable($item_id)
{
    teampassConnect();
    // get data
    $data = DB::queryfirstrow(
        "SELECT i.label AS label, i.description AS description, i.id_tree AS id_tree, i.perso AS perso, i.restricted_to AS restricted_to, i.login AS login, i.id AS id
        FROM ".prefix_table("items")." AS i
        AND ".prefix_table("log_items")." AS l ON (l.id_item = i.id)
        WHERE i.id = %i
        AND l.action = %s",
        intval($item_id),
        'at_creation'
    );

    // Get all TAGS
    $tags = "";
    $data_tags = DB::query("SELECT tag FROM ".prefix_table("tags")." WHERE item_id=%i", $item_id);
    foreach ($data_tags as $itemTag) {
        if (!empty($itemTag['tag'])) {
            $tags .= $itemTag['tag']." ";
        }
    }

    // finaly update
    DB::insert(
        prefix_table("cache"),
        array(
            "id" => $data['id'],
            "label" => $data['label'],
            "description" => $data['description'],
            "tags" => $tags,
            "id_tree" => $data['id_tree'],
            "perso" => $data['perso'],
            "restricted_to" => $data['restricted_to'],
            "login" => $data['login'],
            "folder" => "",
            //"restricted_to" => "0",
            "author" => API_USER_ID,
            "renewal_period" => 0,
            "timestamp" => time(),
            "url" => 0
        )
    );
}


/**
 * Get the setting value
 *
 * @param  string] $setting
 * @return void
 */
function getSettingValue($setting)
{
    // get default language
    $set = DB::queryFirstRow(
        "SELECT `valeur` FROM ".prefix_table("misc")." WHERE type = %s AND intitule = %s",
        "admin",
        $setting
    );

    return $set['valeur'];
}

/**
 * Permits to get rid of special characters that can break the url
 *
 * @param  string $string adapted base64 encoded string
 * @return string
 */
function urlSafeB64Decode($string)
{
    $data = str_replace(
        array('-', '_'),
        array('+', '/'),
        $string
    );
    $mod4 = strlen($data) % 4;
    if ($mod4) {
        $data .= substr('====', $mod4);
    }
    return base64_decode($data);
}

function getGivenUserFolderIds($api_user) {
    $role_str = $api_user['fonction_id'];

    $folder_arr = array();
    $roles = explode(";", $role_str);
    # get role's folder id
    foreach ($roles as $role) {
        $response = DB::query(
            "SELECT folder_id
                        FROM " . prefix_table("roles_values") . "
                        WHERE role_id = %i",
            $role
        );
        foreach ($response as $data) {
            $folder_id = $data['folder_id'];
            array_push($folder_arr, $folder_id);
        }
    }
    # get current user's folder id
    if ($api_user['personal_folder'] == '1') {
        $response = DB::query(
            "SELECT id 
                    FROM " . prefix_table("nested_tree") . "
                    WHERE title = %s AND personal_folder = 1",
            $api_user['id']
        );
        foreach ($response as $data) {
            $folder_id = $data['id'];
            array_push($folder_arr, $folder_id);
        }
    }
    return $folder_arr;
}

/**{
 *  "id": "123", // exists for update otherwise insert
	"label": "test add",
	"pwd": "password",
	"desc": "description",
	"folder_id": "5",
	"login": "18918029397",
	"email": "xxxxx@email.com",
	"url": "http://www.baidu.com",
	"tags": "",
	"anyonecanmodify": "0"
} */
function insertOrUpdateItem($itemJson, $api_user) {
    if (count($itemJson) == 0) {
        return restError('NO_ITEM');
    }
    $item_id = isset($itemJson['id']) ? $itemJson['id'] : 0;
    $item_label = isset($itemJson['label']) ? $itemJson['label'] : '';
    $item_pwd = isset($itemJson['pwd']) ? $itemJson['pwd'] : '';
    $item_desc = isset($itemJson['desc']) ? $itemJson['desc'] : '';
    $item_folder_id = isset($itemJson['folder_id']) ? $itemJson['folder_id'] : '';
    $item_login = isset($itemJson['login']) ? $itemJson['login'] : '';
    $item_email = isset($itemJson['email']) ? $itemJson['email'] : '';
    $item_url = isset($itemJson['url']) ? $itemJson['url'] : '';
    $item_tags = isset($itemJson['tags']) ? $itemJson['tags'] : '';
    $item_anyonecanmodify = isset($itemJson['anyonecanmodify']) ? $itemJson['anyonecanmodify'] : '0';
    if (!empty($item_label) && !empty($item_pwd) && !empty($item_folder_id)) {
        // Check length
        if (strlen($item_pwd) > 50) {
            restError('PASSWORDTOOLONG');
        }
        
        // insert, check if element doesn't already exist
        if ($item_id == 0)  {
            $item_duplicate_allowed = getSettingValue("duplicate_item");
            if ($item_duplicate_allowed !== "1") {
                DB::query(
                    "SELECT *
                                FROM " . prefix_table("items") . "
                                WHERE label = %s AND inactif = %i",
                    addslashes($item_label),
                    "0"
                );
                $counter = DB::count();
                if ($counter != 0) {
                    $itemExists = 1;
                    // prevent the error if the label already exists
                    // so lets just add the time() as a random factor
                    $item_label .= " (" . time() . ")";
                } else {
                    $itemExists = 0;
                }
            } else {
                $itemExists = 0;
            }
            
            if ($itemExists === 1) {
                return restError('ITEMEXISTS');
            }
        } 
        // update, check if item exists
        else {
            if (!is_numeric($item_id)) {
                return restError('NO_ITEM');
            }
            $response = DB::queryFirstRow(
                "SELECT *
                    FROM " . prefix_table("items") . "
                    WHERE id = %i",
                $item_id
            );
            if (count($response) == 0) {
                return restError('NO_DATA_EXIST');
            }

            $item_folder_id = $response['id_tree'];
        }

        // Check Folder ID
        $folder_response = DB::queryFirstRow("SELECT * FROM " . prefix_table("nested_tree") . " WHERE id = %i", $item_folder_id);
        if (count($folder_response) == 0) {
            restError('NOSUCHFOLDER');
        }

        // Check permission
        $canInsert = false;
        $canUpdate = false;
        foreach (explode(';', $api_user['fonction_id']) as $role) {
            if (empty($role) === false) {
                $access = DB::queryFirstRow(
                    "SELECT type FROM " . prefix_table("roles_values") . " WHERE role_id = %i AND folder_id = %i",
                    $role,
                    $item_folder_id
                );
                if ($access['type'] === "R") {
                    $canInsert = $canInsert || false;
                    $canUpdate = $canUpdate || false;
                } elseif ($access['type'] === "W") {
                    $canInsert = $canInsert || true;
                    $canUpdate = $canUpdate || true;
                } elseif ($access['type'] === "ND") {
                    $canInsert = $canInsert || true;
                    $canUpdate = $canUpdate || true;
                } elseif ($access['type'] === "NE") {
                    $canInsert = $canInsert || true;
                    $canUpdate = $canUpdate || false;
                } else if ($access['type'] === "NDNE") {
                    $canInsert = $canInsert || true;
                    $canUpdate = $canUpdate || false;
                }
            }
        }

        // check if folder_id is personal folder
        if ($folder_response['personal_folder'] == '1') {
            $canInsert = true;
            $canUpdate = true;
            // check if folder_id belongs to current user
            if ($folder_response['title'] != $api_user['id']) {
                return restError('FOLDER IS NOT BELONG TO YOU.');
            }
            // check if saltkey provided
            if (isset($_GET['saltkey']) == false || empty($_GET['saltkey'])) {
                return restError('SALTKEY MISSING');
            }
            $user_key_encoded = defuse_validate_personal_key(
                $_GET['saltkey'],
                $api_user['encrypted_psk']
            );
            if (strpos($user_key_encoded, "Error ") !== false) {
                return restError('SALTKEY NOT VALID');
            }
            $saltkey = $user_key_encoded;
            $perso = '1';
        } else {
            $saltkey = "";
            $perso = '0';
        }

        $encrypt = cryption(
            $item_pwd,
            $saltkey,
            "encrypt"
        );
        if (empty($encrypt['string'])) {
            restError('PASSWORDEMPTY');
        }
    
        try {
            if ($item_id == 0) {
                // check if have insert permission
                if (!$canInsert) {
                    return restError('NO PERMISSION');
                }
                // insert
                DB::insert(
                    prefix_table("items"),
                    array(
                        "label" => $item_label,
                        "description" => $item_desc,
                        'pw' => $encrypt['string'],
                        'pw_iv' => '',
                        "email" => $item_email,
                        "url" => $item_url,
                        "id_tree" => intval($item_folder_id),
                        "login" => $item_login,
                        "inactif" => 0,
                        "restricted_to" => "",
                        "perso" => $perso,
                        "anyone_can_modify" => intval($item_anyonecanmodify)
                    )
                );
                $item_id = DB::InsertId();

                // log
                DB::insert(
                    prefix_table("log_items"),
                    array(
                        "id_item" => $item_id,
                        "date" => time(),
                        "id_user" => API_USER_ID,
                        "action" => "at_creation",
                        "raison" => $api_user['name']
                    )
                );
                // Update CACHE table
                DB::insert(
                    prefix_table("cache"),
                    array(
                        "id" => $item_id,
                        "label" => $item_label,
                        "description" => $item_desc,
                        "tags" => $item_tags,
                        "id_tree" => $item_folder_id,
                        "perso" => $perso,
                        "restricted_to" => "",
                        "login" => $item_login,
                        "folder" => "",
                        "author" => API_USER_ID,
                        "renewal_period" => "0",
                        "timestamp" => time(),
                        "url" => "0"
                    )
                );
            } else {
                // check if have update permission
                if (!$canUpdate) {
                    return restError('NO PERMISSION');
                }
                // update
                DB::update(
                    prefix_table("items"),
                    array(
                        "label" => $item_label,
                        "description" => $item_desc,
                        'pw' => $encrypt['string'],
                        'pw_iv' => '',
                        "email" => $item_email,
                        "url" => $item_url,
                        "id_tree" => intval($item_folder_id),
                        "login" => $item_login,
                        "perso" => $perso,
                        "anyone_can_modify" => intval($item_anyonecanmodify)
                    ),
                    "id = %i",
                    $item_id
                );

                // log
                DB::insert(
                    prefix_table("log_items"),
                    array(
                        "id_item" => $item_id,
                        "date" => time(),
                        "id_user" => API_USER_ID,
                        "action" => "at_modification"
                    )
                );
            }
            
            // Add tags
            $tags = explode(' ', $item_tags);
            foreach ((array) $tags as $tag) {
                if (!empty($tag)) {
                    // check if already exists
                    DB::query(
                        "SELECT *
                                        FROM " . prefix_table("tags") . "
                                        WHERE tag = %s AND item_id = %i",
                        strtolower($tag),
                        $item_id
                    );
                    $counter = DB::count();
                    if ($counter === 0) {
                        DB::insert(
                            prefix_table("tags"),
                            array(
                                "item_id" => $item_id,
                                "tag" => strtolower($tag)
                            )
                        );
                    }
                }
            }

            restOk(array("status" => "item added/updated", "item_id" => $item_id));
        } catch (Exception $ex) {
            restError('', $ex->getMessage());
        }
    } else {
        return restError('ITEMMISSINGDATA');
    }
}

function queryGivenUserRole($api_user) {
    $role_str = $api_user['fonction_id'];

    $roles = explode(";", $role_str);
    $role_array = array();
    # get role's folder id
    foreach ($roles as $role) {
        $response = DB::queryFirstRow(
            "SELECT title
                FROM " . prefix_table("roles_title") . "
                WHERE id = %i",
            $role
        );
        array_push($role_array, $response['title']);
    }
    return join(",", $role_array);
}

/**
 * Generates a random key
 *
 * @return void
 */
function generateRandomKey($length)
{
    // load passwordLib library
    $path = '../includes/libraries/PasswordGenerator/Generator/';
    include_once $path . 'ComputerPasswordGenerator.php';

    $generator = new PasswordGenerator\Generator\ComputerPasswordGenerator();

    $generator->setLength($length);
    $generator->setSymbols(false);
    $generator->setLowercase(true);
    $generator->setUppercase(true);
    $generator->setNumbers(true);

    $key = $generator->generatePasswords();

    return $key[0];
}

/**
 * Send back data to user
 *
 * @return void
 */
function restGet()
{
    global $api_version;
    global $SETTINGS;
    global $link;

    if (!@count($GLOBALS['request']) == 0) {
        // Manage type of request
        preg_match(
            '/\/api(\/index.php|)\/(.*)\?apikey=(.*)/',
            $GLOBALS['_SERVER']['REQUEST_URI'],
            $matches
        );
        if (count($matches) === 0) {
            restError('REQUEST_SENT_NOT_UNDERSTANDABLE');
        }
        $GLOBALS['request'] = explode('/', $matches[2]);

        switch ($_SERVER['REQUEST_METHOD']) {
            case 'GET':
                break;
            case 'POST':
                $body = file_get_contents("php://input");
                if (strlen($body) === 0) {
                    restError('EMPTY');
                } else {
                    $GLOBALS['body'] = json_decode($body, true);
                }
                break;
            default:
                restError('EMPTY');
                break;
        }
    }

    if (apikeyChecker($GLOBALS['apikey'])) {
        // Connect to Teampass
        teampassConnect();

        // define the API user through the LABEL of apikey
        $api_info = DB::queryFirstRow(
            "SELECT label
            FROM ".prefix_table("api")."
            WHERE value = %s",
            $GLOBALS['apikey']
        );

        $api_user = DB::queryFirstRow(
            "SELECT id, fonction_id, encrypted_psk, lastname, name, personal_folder
                    FROM " . prefix_table("users") . "
                    WHERE user_api_key = %s",
            $GLOBALS['apikey']
        );

        if (count($api_user) === 0) {
            restError('USER_NOT_EXISTS');
        }

        $api_user['roles'] = queryGivenUserRole($api_user);

        // Load config
        if (file_exists('../includes/config/tp.config.php')) {
            include_once '../includes/config/tp.config.php';
        } else {
            throw new Exception("Error file '/includes/config/tp.config.php' not exists", 1);
        }

        if ($GLOBALS['request'][0] == "read") {
            if ($GLOBALS['request'][1] == 'whoami') {
                $payload = $api_user;
                if (isset($_GET['saltkey']) && !empty($_GET['saltkey']) && !empty($api_user['encrypted_psk'])) {
                    $user_saltkey = defuse_validate_personal_key(
                        $_GET['saltkey'],
                        $api_user['encrypted_psk']
                    );
                    if (strpos($user_saltkey, "Error ") !== false) {
                        $payload['saltkey'] = false;
                    } else {
                        $payload['saltkey'] = true;
                    }
                }
                restOk($payload);
            } elseif ($GLOBALS['request'][1] == "mypws") {
                /*
                * READ API USER ITEMS
                */
                /*
                * Expected call format: .../api/index.php/read/mypws?apikey=<VALID API KEY>&saltkey=<VALID PERSON SALT KEY>
                */
                // load library
                include_once '../sources/SplClassLoader.php';
                //Load Tree
                $tree = new SplClassLoader('Tree\NestedTree', '../includes/libraries');
                $tree->register();
                $tree = new Tree\NestedTree\NestedTree(prefix_table("nested_tree"), 'id', 'parent_id', 'title');

                $folder_arr = getGivenUserFolderIds($api_user);
                $folder_str = array_filter($folder_arr);

                // get ids
                if (is_array($folder_str)) {
                    $condition = "id_tree IN %ls";
                    $condition_value = $folder_str;
                } else {
                    $condition = "id_tree = %s";
                    $condition_value = $folder_str;
                }

                $data = "";
                // get items in this module
                $response = DB::query(
                    "SELECT id,label,url,login,pw, pw_iv, url, id_tree, description, email
                    FROM ".prefix_table("items")."
                    WHERE inactif='0' AND ".$condition,
                    $condition_value
                );
                
                foreach ($response as $data) {
                    // build the path to the Item
                    $path = "";
                    $arbo = $tree->getPath($data['id_tree'], true);
                    foreach ($arbo as $elem) {
                        if (empty($path)) {
                            $path = stripslashes($elem->title);
                        } else {
                            $path .= " > ".stripslashes($elem->title);
                        }
                    }

                    // prepare output
                    $json[$data['id']]['id'] = $data['id'];
                    $json[$data['id']]['label'] = mb_convert_encoding($data['label'], mb_detect_encoding($data['label']), 'UTF-8');
                    $json[$data['id']]['description'] = mb_convert_encoding($data['description'], mb_detect_encoding($data['description']), 'UTF-8');
                    $json[$data['id']]['login'] = mb_convert_encoding($data['login'], mb_detect_encoding($data['login']), 'UTF-8');
                    $json[$data['id']]['email'] = mb_convert_encoding($data['email'], mb_detect_encoding($data['email']), 'UTF-8');
                    $json[$data['id']]['url'] = mb_convert_encoding($data['url'], mb_detect_encoding($data['url']), 'UTF-8');
                    if ($path == $api_user['id']) {
                        if (!empty($_GET['saltkey']) && !empty($_GET['saltkey']) && !empty($api_user['encrypted_psk'])) {
                            $user_saltkey = defuse_validate_personal_key(
                                $_GET['saltkey'],
                                $api_user['encrypted_psk']
                            );
                            if (strpos($user_saltkey, "Error ") !== false) {
                                $crypt_pw['string'] = "Provided personal saltkey is wrong. Can't decrypt password.";
                            } else {
                                $crypt_pw = cryption($data['pw'], $user_saltkey, "decrypt");
                            }
                        } else {
                            $crypt_pw['string'] = "Missing personal saltkey. Can't decrypt password.";
                        }
                        $path = $api_user['lastname'].$api_user['name']."(Personal)";
                    } else {
                        $crypt_pw = cryption($data['pw'], "", "decrypt");
                    }
                    $json[$data['id']]['password'] = $crypt_pw['string'];
                    $json[$data['id']]['folder_id'] = $data['id_tree'];
                    $json[$data['id']]['path'] = $path;
                }
                if (isset($json) && $json) {
                    restOk($json);
                } else {
                    restError('EMPTY');
                }
            } elseif ($GLOBALS['request'][1] == "myfolders") {
                /*
                * Expected call format: .../api/index.php/read/myfolders?apikey=<VALID API KEY>&saltkey=<VALID PERSON SALT KEY>
                */
                $folder_arr = getGivenUserFolderIds($api_user);

                $response = DB::query(
                    "SELECT id, title, nlevel, parent_id, personal_folder
                                FROM " . prefix_table("nested_tree") . "
                                WHERE id IN %ls",
                    array_filter($folder_arr)
                );
                $result = array();
                foreach ($response as $data) {
                    $json = array();
                    $json['id'] = $data['id'];
                    if ($data['personal_folder'] == '1') {
                        $json['title'] = $api_user['lastname'].$api_user['name']."(Personal)";
                    } else {
                        $json['title'] = $data['title'];
                    }
                    $json['level'] = $data['nlevel'];
                    $json['parent_id'] = $data['parent_id'];
                    array_push($result, $json);
                }
                if (isset($result) && $result) {
                    restOk($result);
                } else {
                    restError('EMPTY');
                }
            } elseif ($GLOBALS['request'][1] == "generate") {
                $body = $GLOBALS['body'];
                $entropy = isset($body['length']) && is_numeric($body['length']) ? (int) $body['length'] : 20;
                $password = generateRandomKey($entropy);
                return restOk(array('password' => $password, 'entropy' => $entropy));
            }
        } elseif ($GLOBALS['request'][0] == "find") {
            if ($GLOBALS['request'][1] == "item") {
                /*
                * Expected call format: .../api/index.php/find/item?apikey=<VALID API KEY>&saltkey=<VALID PERSON SALT KEY>&keyword=<KEY WORLD>
                */
                // load library
                include_once '../sources/SplClassLoader.php';
                //Load Tree
                $tree = new SplClassLoader('Tree\NestedTree', '../includes/libraries');
                $tree->register();
                $tree = new Tree\NestedTree\NestedTree(prefix_table("nested_tree"), 'id', 'parent_id', 'title');

                $body = $GLOBALS['body'];
                $keyword = isset($body['keyword']) ? $body['keyword'] : ""; 
                $url = isset($body['url']) ? $body['url'] : ""; 
                if ($keyword == "" && $url == "") {
                    return restError("ARGUMENT MISSING", "查询参数keyword或者url必须有一个");
                }
                $folder_arr = getGivenUserFolderIds($api_user);

                $response = DB::query(
                    "SELECT id, label, login, pw, pw_iv, url, id_tree, description, email
                    FROM ".prefix_table("items")."
                    WHERE
                    inactif = 0
                    AND id_tree IN %ls
                    AND (label LIKE %ss OR description LIKE %ss OR login LIKE %ss) AND url LIKE %ss",
                    $folder_arr,
                    $keyword,
                    $keyword,
                    $keyword,
                    $url
                );
                $inc = 0;
                foreach ($response as $data) {
                    // build the path to the Item
                    $path = "";
                    $arbo = $tree->getPath($data['id_tree'], true);
                    foreach ($arbo as $elem) {
                        if (empty($path)) {
                            $path = stripslashes($elem->title);
                        } else {
                            $path .= " > ".stripslashes($elem->title);
                        }
                    }

                    // prepare output
                    $json[$inc]['id'] = mb_convert_encoding($data['id'], mb_detect_encoding($data['id']), 'UTF-8');
                    $json[$inc]['label'] = mb_convert_encoding($data['label'], mb_detect_encoding($data['label']), 'UTF-8');
                    $json[$inc]['description'] = mb_convert_encoding($data['description'], mb_detect_encoding($data['description']), 'UTF-8');
                    $json[$inc]['login'] = mb_convert_encoding($data['login'], mb_detect_encoding($data['login']), 'UTF-8');
                    $json[$inc]['email'] = mb_convert_encoding($data['email'], mb_detect_encoding($data['email']), 'UTF-8');
                    $json[$inc]['url'] = mb_convert_encoding($data['url'], mb_detect_encoding($data['url']), 'UTF-8');
                    if ($path == $api_user['id']) {
                        if (!empty($_GET['saltkey']) && !empty($_GET['saltkey']) && !empty($api_user['encrypted_psk'])) {
                            $user_saltkey = defuse_validate_personal_key(
                                $_GET['saltkey'],
                                $api_user['encrypted_psk']
                            );
                            if (strpos($user_saltkey, "Error ") !== false) {
                                $crypt_pw['string'] = "Provided personal saltkey is wrong. Can't decrypt password.";
                            } else {
                                $crypt_pw = cryption($data['pw'], $user_saltkey, "decrypt");
                            }
                        } else {
                            $crypt_pw['string'] = "Missing personal saltkey. Can't decrypt password.";
                        }
                        $path = $api_user['name'] . "(Personal)";
                    } else {
                        $crypt_pw = cryption($data['pw'], "", "decrypt");
                    }
                    $json[$inc]['password'] = $crypt_pw['string'];
                    $json[$inc]['folder_id'] = $data['id_tree'];
                    $json[$inc]['path'] = $path;
                    $json[$inc]['status'] = utf8_encode("OK");

                    $inc++;
                }
                if (isset($json) && $json) {
                    restOk($json);
                } else {
                    restError('EMPTY');
                }
            }
        } elseif ($GLOBALS['request'][0] == "add") {
            if ($GLOBALS['request'][1] == "item") {
                /*
                * Expected call format: .../api/index.php/add/item/<label>;<password>;<description>;<folder_id>;<login>;<email>;<url>;<tags>;<any one can modify>?apikey=<VALID API KEY>&saltkey=<VALID SALT KEY>
                */
                insertOrUpdateItem($GLOBALS['body'], $api_user);
            } 
        } elseif ($GLOBALS['request'][0] == "update") {
            if ($GLOBALS['request'][1] == "item") {
                /*
                * Expected call format: .../api/index.php/update/item/<item_id>/<label>;<password>;<description>;<folder_id>;<login>;<email>;<url>;<tags>;<any one can modify>?apikey=<VALID API KEY>&saltkey=<VALID SALT KEY>
                */
                insertOrUpdateItem($GLOBALS['body'], $api_user);
            } 
        } else {
            restError('METHOD');
        }
    }
}

function restOk($jsonResult) {
    $message['error_code'] = 0;
    $message['data'] = $jsonResult;
    $message['success'] = true;
    echo json_encode($message);
    exit(0);
}
/**
 * Return correct error message
 *
 * @param  string $type
 * @param  string $detail
 * @return void
 */
function restError($type, $detail = 'N/A')
{
    $error_code = 500;
    switch ($type) {
        case 'APIKEY':
            $message = array('message' => 'This api_key '.$GLOBALS['apikey'].' doesn\'t exist');
            header('HTTP/1.1 405 Method Not Allowed');
            break;
        case 'NO_CATEGORY':
            $message = array('message' => 'No folder specified');
            break;
        case 'NO_ITEM':
            $message = array('message' => 'No item specified');
            break;
        case 'EMPTY':
            $error_code = 0;
            $message = array('message' => 'No results');
            break;
        case 'IPWHITELIST':
            $message = array('message' => 'Ip address not allowed.');
            header('HTTP/1.1 405 Method Not Allowed');
            break;
        case 'MYSQLERR':
            $message = array('message' => $detail);
            header('HTTP/1.1 500 Internal Server Error');
            break;
        case 'METHOD':
            $message = array('message' => 'Method not authorized', 'code' => 'METHOD_NOT_AUTHORIZED');
            header('HTTP/1.1 405 Method Not Allowed');
            break;
        case 'ITEMBADDEFINITION':
            $message = array('message' => 'Item definition not complete');
            header('HTTP/1.1 405 Method Not Allowed');
            break;
        case 'ITEM_MALFORMED':
            $message = array('message' => 'Item definition not numeric');
            header('HTTP/1.1 405 Method Not Allowed');
            break;
        case 'USERBADDEFINITION':
            $message = array('message' => 'User definition not complete');
            header('HTTP/1.1 405 Method Not Allowed');
            break;
        case 'USERLOGINEMPTY':
            $message = array('message' => 'Empty Login given');
            header('HTTP/1.1 405 Method Not Allowed');
            break;
        case 'USERALREADYEXISTS':
            $message = array('message' => 'User already exists');
            header('HTTP/1.1 405 Method Not Allowed');
            break;
        case 'REQUEST_SENT_NOT_UNDERSTANDABLE':
            $message = array('message' => 'URL format is not following requirements');
            break;
        case 'AUTH_NOT_GRANTED':
            $message = array('message' => 'Bad credentials for user', 'code' => 'AUTH_NOT_GRANTED');
            header('HTTP/1.1 404 Error');
            break;
        case 'AUTH_NO_URL':
            $message = array('message' => 'URL needed to grant access');
            break;
        case 'AUTH_NO_IDENTIFIER':
            $message = array('message' => 'Credentials needed to grant access', 'code' => 'AUTH_NO_IDENTIFIER');
            break;
        case 'AUTH_NO_DATA':
            $message = array('message' => 'Data not allowed for the user', 'code' => 'AUTH_NO_DATA');
            break;
        case 'AUTH_PSK_ERROR':
            $message = array('message' => 'Personal Saltkey is wrong', 'code' => 'AUTH_PSK_ERROR');
            header('HTTP/1.1 404 Error');
            break;
        case 'NO_DATA_EXIST':
            $message = array('message' => 'No data exists', 'code' => 'NO_DATA_EXIST');
            break;
        case 'NO_DESTINATION_FOLDER':
            $message = array('message' => 'No destination folder provided');
            break;
        case 'PASSWORDTOOLONG':
            $message = array('message' => 'Password is too long');
            break;
        case 'NOSUCHFOLDER':
            $message = array('message' => 'Folder ID does not exist');
            break;
        case 'PASSWORDEMPTY':
            $message = array('message' => 'Password is empty');
            break;
        case 'ITEMEXISTS':
            $message = array('message' => 'Label already exists');
            break;
        case 'ITEMMISSINGDATA':
            $message = array('message' => 'Label or Password or Folder ID is missing');
            break;
        case 'SET_NO_DATA':
            $message = array('message' => 'No data to be stored');
            break;
        case 'NO_PF_EXIST_FOR_USER':
            $message = array('message' => 'No Personal Folder exists for this user');
            break;
        case 'HTML_CODES_NOT_ALLOWED':
            $message = array('message' => 'HTML tags not allowed');
            break;
        case 'TITLE_ONLY_WITH_NUMBERS':
            $message = array('message' => 'Title only with numbers not allowed');
            break;
        case 'ALREADY_EXISTS':
            $message = array('message' => 'Data already exists');
            break;
        case 'COMPLEXICITY_LEVEL_NOT_REACHED':
            $message = array('message' => 'complexity level was not reached');
            break;
        case 'NO_PARAMETERS':
            $message = array('message' => 'No parameters given');
            break;
        case 'USER_NOT_EXISTS':
            $message = array('message' => 'User does not exist');
            break;
        case 'NO_PSALTK_PROVIDED':
            $message = array('message' => 'No Personal saltkey provided');
            break;
        case 'EXPECTED_PARAMETER_NOT_PROVIDED':
            $message = array('message' => 'Provided parameters are not correct');
            break;
        default:
            $message = array('message' => $type . ' ' . $detail);
            header('HTTP/1.1 500 Internal Server Error');
            break;
    }

    $message['error_code'] = $error_code;
    $message['data'] = array();
    $message['success'] = false;
    echo json_encode($message);
    exit(0);
}

/**
 * Is it a valid api key?
 *
 * @param  string $apikey_used
 * @return void
 */
function apikeyChecker($apikey_used)
{
    teampassConnect();
    $apikey_pool = teampassGetKeys();

    // if needed extract key from credentials
    if (strlen($apikey_used) > 40) {
        $userCredentials = urlSafeB64Decode(substr($apikey_used, 40));
        $apikey_used = substr($apikey_used, 0, 39);
    }

    if (in_array($apikey_used, $apikey_pool)) {
        return(1);
    } else {
        restError('APIKEY', $apikey_used);
    }
}

/**
 * Permits to hash parameters
 *
 * @param  string $var_p
 * @param  string $var_s
 * @param  string $var_c
 * @param  string $var_kl
 * @param  integer $var_st
 * @param  string $var_a
 * @return void
 */
function teampassPbkdf2Hash($var_p, $var_s, $var_c, $var_kl, $var_st = 0, $var_a = 'sha256')
{
    $var_kb = $var_st + $var_kl;
    $var_dk = '';

    for ($block = 1; $block <= $var_kb; $block++) {
        $var_ib = $var_h = hash_hmac($var_a, $var_s.pack('N', $block), $var_p, true);
        for ($var_i = 1; $var_i < $var_c; $var_i++) {
            $var_ib ^= ($var_h = hash_hmac($var_a, $var_h, $var_p, true));
        }
        $var_dk .= $var_ib;
    }

    return substr($var_dk, $var_st, $var_kl);
}
