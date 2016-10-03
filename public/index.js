var express = require('express')
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var bodyParser =require('body-parser');

app.set('port', (process.env.PORT || 5000));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(express.static(__dirname + '/public'));
var roomA = {};
var roomALeader = "none";
var roomAStatus = "wait_for_more";

var id = 1;

var answer = []
var userList = [];
var leaderNum = 0;
var answered = 0;

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

var nsa = io.of('/A');


nsa.on('connection', function(socket){
    
    console.log(socket.id + " has connected");
    
    name = "Guest" + id;
    id++;
    roomA[socket.id] = {"name": name,"status" : "wait", "score":0};
    
    socket.emit("Name", name);
    socket.broadcast.emit("add user", name, 0);
    
    for (key in roomA){
        if (key != socket.id) {
            socket.emit('add user', roomA[key]["name"], roomA[key]["score"]);
        }
    }
    
    if (roomAStatus == "wait_for_more") {
        if (Object.keys(roomA).length >= 2 ){
            roomAStatus="running";
            initUserList();
            console.log("starting round with ", roomA[userList[0]]["name"])
            nsa.emit("Round Start", roomA[userList[0]]["name"])
        }
    }
    
    function initUserList(){
        for (key in roomA){
            userList.push(key);
        }
    }
    
    socket.on('submit', function(checked){
        answered += 1;
        console.log(socket.id + " : submitted : " + checked);
        if (socket.id == userList[leaderNum]){
            answer = checked.slice();
        } else {
            var score = 0;
            var incorrect = 0;
            
            for (var i = 0; i< checked.length; i++){
                if (answer.indexOf(checked[i]) > -1){
                    score += 1;
                } else {
                    incorrect += 1;
                }     
            }
            
            // lose points for each answer we miss
            for (var i = 0; i< answer.length; i++){
                if (checked.indexOf(answer[i]) == -1){
                    incorrect += 1;
                }     
            }
            // bonus points for being all correct
            if (incorrect == 0){
                score += 1;
            }
            score -= incorrect;
            
            roomA[socket.id]["score"] = roomA[socket.id]["score"] + score;
            
            console.log(roomA[socket.id]["name"] + " Now has " + roomA[socket.id]["score"] + " points!")
            nsa.emit("score adjust", roomA[socket.id]["name"], roomA[socket.id]["score"])
            
        }
        
        if (answered >= Object.keys(roomA).length) {
            console.log("starting next round")
            nextRound();
        }
    });
    
    function nextRound(){
        answered = 0;
        initUserList();
        leaderNum ++;
        if (leaderNum >= Object.keys(userList).length ) {
            leaderNum == 0;
        }
        nsa.emit("Round Start", roomA[userList[leaderNum]]["name"])
    };
    socket.on('disconnect', function(){
        console.log('A user has disconnected');
        key = socket.id;
        name = roomA[key]["name"];
        
        var loc = userList.indexOf(key);
        userList.splice(loc, 1);
        
        if (name != undefined) {
            nsa.emit("remove user", name);
            delete roomA[key];
        }
        // cannot proceed, game pauses
        if (Object.keys(roomA).length <= 2) {
            io.emit("Waiting for Players");
            leaderNum = 0;
            return false;
        }
        
        if (leaderNum <= loc){
            
            leaderNum = Math.max(leaderNum -1, 0);
            setLeader();
        }

    });
    
    socket.on('status query', function(){
        var v_status = roomA[socket.id]["status"];
        socket.emit("status", v_status);
    });
    
    socket.on('submit guess', function(){
        
    });
    
    socket.on('submit next level', function(){
        
    });
});

http.listen((process.env.PORT || 3000), function(){
  console.log('listening on *:3000');
});