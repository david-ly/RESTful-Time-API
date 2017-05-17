var restify = require('restify');
var server = require('./server');
 
var client = restify.createJsonClient({
    url: 'http://localhost:3000'
});
 
var time = {
    id: 1,
    time: Date.now(),
    UTCtime: "2:50AMWednesday,May17,2017"
};

// client.post('/time/set/' + time.id + '/' + time.UTCtime, time, function (err, req, res, data) {
//     if (err) {
//         throw err;
//     } else {
//         console.log('Time succesfully added');
//         console.log(data);
//     }
// })

// time.time = Date.now();
// client.put('/time/set/' + time.id + '/' + time.UTCtime, time, function(err, req, res, data) {
//     if (err) {
//         throw err;
//     } else {
//         console.log('Time succesfully updated');
//         console.log(data);
//     }
// })

client.del('/time/delete/' + time.id, function (err, req, res, data) {
    if (err) {
        throw err;
    } else {
        console.log(data);
    }
});