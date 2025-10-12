<?php

/*
* Given JSON data, write to a file.
* This really, really, really doesn't belong in production. So watch out.
*/

// Validate that data exists and falls within the allowed parameters

if( (! isset($_POST['data'])) || (! isset($_POST['league'])) || (! isset($_POST['category'])) || (! isset($_POST['cup']))){
	exit("Data does not have valid keys.");
}

// If only there was some universal source for this info, like some kind of master file??
// But nah let's scratch our head for 20 minutes when we can't figure out why the write function doesn't work after we change a name

$leagues = [500,1500,2500,10000];
$categories = ["closers","attackers","defenders","leads","switches","chargers","consistency","overall","beaminess"];

// Allow custom cups and categories
$allowCustom = true;

if(! in_array($_POST['league'], $leagues)){
	exit("League is not valid");
}

// Only validate category if it's not a custom cup
if(!$allowCustom && !in_array($_POST['category'], $categories)){
	exit("Category is not valid");
}

// Validate cup name format (prevent directory traversal)
if(!preg_match('/^[a-z0-9_]+$/', $_POST['cup'])){
	exit("Cup name contains invalid characters");
}

$json = json_decode($_POST['data']);

if($json === null){
	exit("JSON cannot be decoded.");
}

$filepath = 'rankings/' . $_POST['cup'] . '/' . $_POST['category'] . '/rankings-' . $_POST['league'] . '.json';

// Create directories if they don't exist
$directory = dirname($filepath);
if (!file_exists($directory)) {
    mkdir($directory, 0755, true);
}

if(file_put_contents($filepath, $_POST['data']) !== false){
	echo '{ "status": "Success", "filepath": "' . $filepath . '" }';
} else{
	echo '{ "status": "Fail", "error": "Could not write file" }';
}

?>
