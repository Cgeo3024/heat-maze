var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var bodyParser = require('body-parser');

app.set('port', (process.env.PORT || 5000));


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res){
    res.sendFile(__dirname + 'index.html');
});

var rooms = [];
var barDelta = 5;
var timeGap = 5;
var roomTemp = 15;
var userCount = 0;
var users = [];

// Functions first set up when suer connects to the socket.io instance
io.on('connection', function(socket){
    
    console.log("new member joined!");
    
    users.push({id: socket.id, bars:null, handle: null});
    
    
    // user requests change to variable heat sources
    socket.on("update sources", function(data){
        
        var thisUser = null;
        for (user in users){
            if (users[user].id == socket.id){
                thisUser = users[user];
            }
        }

        for (var i = 0; i < data.temps.length; i++){
            
            thisUser.room.bars[data.bar].temps[data.temps[i].pos] = data.temps[i].temp;

        }
    });
    
    socket.on('disconnect', function(){
        console.log(socket.id + " has left");
        var thisUser = null;
        var index = -1;
        for (user in users){
            if (users[user].id == socket.id){
                thisUser = users[user];
                clearInterval(user.handle);
                index = user;
            }
        }
        if (index > -1)
        {
            users.splice(index, 1);
        }
    });
    // user switches to a new room
    socket.on("switch room", function(room){
        console.log("user " + socket.id +" switched to " + room);
        
        var thisUser = null;
        for (user in users){
            if (users[user].id == socket.id){
                thisUser = users[user];
            }
        }
        
        clearInterval(thisUser.handle);
        
        var newRoom = initRoom(room);
        //var newRoom = initBars(room);
        
        var initVals = summarize(newRoom);
        
        socket.emit("init", initVals);
       // console.log("Init Vals : " + initVals);
        
        thisUser.room = newRoom;
        for (user in users){
            if (user.id == socket.id){
                clearInterval(user.handle);
                break;
            }
        }
        thisUser.handle = setInterval(function() {
           iterateRoom(thisUser.room);
           var summary = summarize(thisUser.room);
           socket.emit("update bars", {bars: summary.bars, elapsedTime : timeGap});
           },
           timeGap);
    });
});

// creates a condensed sumamry of the user room for transmission
function summarize(room)
{
    // temporarily stores the full list of summary bars
    var bars = [];
    //console.log(room);
    for (var i = 0; i < room.bars.length; i++)
    {   
        var summBar = {};
        
        summBar.points = [];
        
        var bar = room.bars[i]
        
        for (var j = 0; j < bar.watchPoints.length; j++)
        {
            //console.log(bar.watchPoints);
            var pos = bar.watchPoints[j]
            summBar.points.push({pos: pos, temp: bar.temps[pos]})
        }
        
        if (bar.variable != null) {
            summBar.variable = []
            for (var j = 0; j < bar.variable.length; j++)
            {
                var pos = bar.variable[j]
                summBar.variable.push({pos: pos, temp: bar.temps[pos]})
            }
        }
        bars.push(summBar);
        //console.log(summBar);
    }
    
    return {room: "~", bars:bars};
}


function iterateRoom(room){
    iterateBars(room.bars);
    if (room.joins != null){
        iterateJoins(room.bars, room.joins);
    }
}

function initRoom(roomType)
{
    var newRoom = {};
    if (roomType == "Solo_A")
    {
        newRoom.bars=initBars("A");
        newRoom.roomTemp = 20;
    }
    if (roomType == "Solo_B")
    {
        newRoom.bars=initBars("B");
        newRoom.roomTemp = 15;
    }
    if (roomType == "Solo_C")
    {
        newRoom.bars=initBars("C");
        newRoom.roomTemp = 25;
    }
    if (roomType == "Solo_D")
    {
        newRoom.bars=initBars("D");
        newRoom.roomTemp = 25;
        newRoom.joins = [];
        
        newRoom.joins.push({sideA: {bar: 0, pos: 2}, sideB: {bar: 1, pos: 2}, temp: 15});
    }
    if (roomType == "Group_A")
    {
        
    }
    if (roomType == "Group_B")
    {
        
    }
    if (roomType == "Group_C")
    {
        
    }
    
    return newRoom;
}
// creates a standard bar with given length and standard temperature
function initBar(id, length, material, roomTemp, divisions){
    var newBar = {};
    newBar.id = id;
    newBar.material = material;
    newBar.temps = [];
    
    for (i = 0; i < length; i++){
        newBar.temps.push(roomTemp);
    }
    
    newBar.watchPoints = divideBar(length, divisions);
    
    return newBar;
    //newBar.Area = CXArea;
}
// provides an array of important watchpoints
function divideBar(length, divisions)
{
    points = [];
    
    if (divisions > 0){
        var increment = length/divisions;
        
        var i = 0;
        var pos = 0;
        

        // dividing the bar stops if we run out of bar or divisions
        while ( i < divisions && pos < length)
        {
            points.push(Math.floor(pos));
            
            pos += increment;
            i += 1;
        }  
    }
    
    return points;
}

function initBars(roomType){
    var bars = [];
    if (roomType == "A")
    {
        
        var newBar = initBar("A", 30, "Cu", 20, 5);
        
        newBar.fixed    = [0, 29];
        newBar.variable = [0];
        newBar.temps[0] = 40;
        
        bars.push(newBar);
        
    }
    if (roomType == "B")
    {
        var newBar = initBar("A", 20, "Cu", 15, 5);
        
        newBar.fixed    = [0, 9];
        newBar.variable = [9];
        
        bars.push(newBar);
        
        var newBar = initBar("B", 15, "Fe", 15, 5);
        
        newBar.fixed    = [0, 14];
        newBar.variable = [0, 14];
        
        bars.push(newBar);
    }
    if (roomType == "C")
    {
        var newBar = initBar("A", 10, "Cu", 15, 5);
        
        newBar.fixed    = [0, 9];
        newBar.variable = [];
        
        bars.push(newBar);
        
        var newBar = initBar("B", 15, "Fe", 15, 5);
        
        newBar.fixed    = [0, 14];
        newBar.variable = [0, 14];
        
        bars.push(newBar);
        
        var newBar = initBar("Fe", 50, "Fe", 15, 10);
        
        newBar.fixed    = [0, 3, 14, 49];
        newBar.variable = [0, 49];
        
        bars.push(newBar);
    }
    
    if (roomType == "D")
    {
        var newBar = initBar("A", 5, "Cu", 15, 5);
        
        newBar.fixed = [];
        bars.push(newBar);
        
        var newBar = initBar("B", 5, "Cu", 15, 5);
        
        newBar.fixed    = [0, 4];
        newBar.variable = [0, 4];
        
        bars.push(newBar);

    }
    
    return bars;
}

// iterates temperature changes along a bar.
// CURENTLY NOT COMPLETE FOR THE EXTREME ENDS OF BARS
function iterateBars(bars){

    for (bar in bars){
        var nextTemps = [];
        
        
        for (var i = 0; i < bars[bar].temps.length; i++){
            nextTemps.push(bars[bar].temps[i]);
            
            var secondDerivTX = 0;
            
            if (i == 0){
                secondDerivTX = 
                (-bars[bar].temps[i] + bars[bar].temps[i + 1])/(barDelta*barDelta/1000000);
            } 
            else if (i == bars[bar].temps.length -1)
            {
                secondDerivTX = 
                (bars[bar].temps[i -1] -bars[bar].temps[i])/(barDelta*barDelta/1000000);
            }
            else 
            {
                secondDerivTX = 
                (bars[bar].temps[i -1] - 2* bars[bar].temps[i] + bars[bar].temps[i + 1])/(barDelta*barDelta/1000000);
            }
            
            var diffusivity =  0.000023;
            
            if (bars[bar].material == "Cu"){
            diffusivity = 0.000111;
            }
            if (bars[bar].material == "Fe"){
                diffusivity = 0.000023;
            }
            if (bars[bar].material == "Qu"){
                diffusivity = 0.0000014;
            }
            if (bars[bar].material == "Sn"){
                diffusivity = 0.00004;
            }
        
            var deltaT = secondDerivTX * diffusivity *timeGap/1000;
            nextTemps[i] = bars[bar].temps[i] + deltaT;
        }
        
        for (var i = 0; i <bars[bar].temps.length; i++){
            if (bars[bar].fixed.indexOf(i) == -1) {
                bars[bar].temps[i] = nextTemps[i];
            } else {
                bars[bar].temps[i] = bars[bar].temps[i];
            }
        }
        nextTemps = [];
    } 
}

// Used to update temperatures that cross between bars
// Currently in testing phase
function iterateJoins(bars, joins){
    
    for (var i = 0; i < joins.length; i++)
    {
        var sideA = joins[i].sideA;
        var sideB = joins[i].sideB;

        var secondDerivTX = 
            (bars[sideA.bar].temps[sideA.pos]
                - 2* joins[i].temp + 
                bars[sideB.bar].temps[sideB.pos])
                /(barDelta*barDelta/1000000);
        var diffusivity = 0.000023;
        
        var deltaT = secondDerivTX * diffusivity *timeGap/1000;
        var nextTempJ = joins[i].temp + deltaT;

        secondDerivTX = 
            (joins[i].temp - bars[sideA.bar].temps[sideA.pos]) 
            /(barDelta*barDelta/1000000);
        
        deltaT = secondDerivTX * diffusivity *timeGap/1000;
        var nextTempA = bars[sideA.bar].temps[sideA.pos] + deltaT;
        
        secondDerivTX = 
            (joins[i].temp - bars[sideB.bar].temps[sideB.pos])
            /(barDelta*barDelta/1000000);
        deltaT = secondDerivTX * diffusivity *timeGap/1000;
        var nextTempB = bars[sideB.bar].temps[sideB.pos] + deltaT;
        
        joins[i].temp = nextTempJ;
        
        bars[sideB.bar].temps[sideB.pos] = nextTempB;
        bars[sideA.bar].temps[sideA.pos] = nextTempA;
    }
}

http.listen((process.env.PORT || 3000), function(){
  console.log('listening on *:3000');
});


