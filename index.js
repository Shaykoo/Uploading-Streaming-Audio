/**
 * NPM Module dependencies.
 */
const express = require('express');
const trackRoute = express.Router();
const multer = require('multer');

const mongodb = require('mongodb');
const MongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;

/**
 * NodeJS Module dependencies.
 */
const { Readable } = require('stream');

/**
 * Create Express server && Express Router configuration.
 */
const app = express();
app.use('/tracks', trackRoute); //it can be generic to all paths, or triggered only on specific path(s) your server handles - is what we are doing here

/**
 * Connect Mongo Driver to MongoDB.
 */
let db;
MongoClient.connect('mongodb://localhost/trackDB', { useUnifiedTopology: true }, (err, client) => {
  if (err) {
    console.log('MongoDB Connection Error. Please make sure that MongoDB is running.');
    process.exit(1); // exits from the current Node.js process. It takes an exit code, which is an integer
  }
  db = client.db('trackDB');
});


/**
 * GET /tracks/:trackID
 */
trackRoute.get('/:trackID', (req, res) => {
    try {
      var trackID = new ObjectID(req.params.trackID);
    } catch(err) {
      return res.status(400).json({ message: "Invalid trackID in URL parameter. Must be a single String of 12 bytes or a string of 24 hex characters" }); 
    }
    //setting the response headers. This will help the browser know how to handle the response.
    res.set('content-type', 'audio/mp3');
    res.set('accept-ranges', 'bytes');
  
    let bucket = new mongodb.GridFSBucket(db, {
      bucketName: 'tracks'
    });
  
    //The openDownloadStream method on the GridFSBucket object returns a readable stream for streaming file data from gridfs. We only need to pass the trackID of the file we want to stream.
    let downloadStream = bucket.openDownloadStream(trackID); //openDownloadStream method that we use requires a variable of type objectID to be passed to it.
    //readable stream emits five types of events; close, data, end, error and readable.

    //For our purposes we are only interested in the data, error and end events. 
    //We write a listener function for each of these possible events.


    //We must add a data event listener in order to start the stream flowing. 
    //The data event is emitted each time a chunk is available (a chunk being a part of the file). 
    //The listener callback will be passed a chunk each time the event is called. 
    //Inside the listener callback we can then use the res.write function to send the 
    //chunk to the client. This is performed until the readable stream runs out of data; 
    //at which point the end event is called. As a sidenote the res.write function is actually not a part of express, we are directly calling the Node HTTP API.

    downloadStream.on('data', (chunk) => {
      res.write(chunk);
    });
  
    downloadStream.on('error', () => {
      res.sendStatus(404);  //not found error
    });
  
    downloadStream.on('end', () => {  
      res.end();  //ends the response process
    });
  });



/**
 * POST /tracks
 */
trackRoute.post('/', (req, res) => {
    //Since we are using Multer in memory storage mode the file is stored in memory 
    //as an object of type Buffer
    const storage = multer.memoryStorage()
    const upload = multer({ storage: storage, limits: { fields: 1, fileSize: 6000000, files: 1, parts: 2 }});
    //storage: storage - This will tell multer to store the uploaded file in a buffer while it is being
    // processed, preventing the file from ever being written to the file system
    upload.single('track')(req, res, (err) => { //method to accept a single file with the name 'track'
      if (err) {
        return res.status(400).json({ message: "Upload Request Validation Failed" });
      } else if(!req.body.name) {
        return res.status(400).json({ message: "No track name in request body" });
      }
      
      let trackName = req.body.name;
      
      // Convert buffer to Readable Stream -imp
      const readableTrackStream = new Readable();
      //Multer binds the file to a field in the express request object.
      // We can retrieve it from the request object under req.file.buffer.
      readableTrackStream.push(req.file.buffer);
      //Readables .push method allows us to push the buffer into the readable.
      // Finally we push a null value into the readable to signify the end of the data.
      readableTrackStream.push(null);
  
      let bucket = new mongodb.GridFSBucket(db, {
        bucketName: 'tracks'
      });


      //The GridFSBuckets .openUploadStream() method returns a 
      //writable stream for writing buffers to GridFS
  
      let uploadStream = bucket.openUploadStream(trackName);
      let id = uploadStream.id;
      readableTrackStream.pipe(uploadStream); //This finally starts the process of streaming the file to gridFS.
  
      uploadStream.on('error', () => {
        return res.status(500).json({ message: "Error uploading file" });
      });
  
      uploadStream.on('finish', () => {
        return res.status(201).json({ message: "File uploaded successfully, stored under Mongo ObjectID: " + id });
      });
    });
  });
  
  app.listen(3005, () => {
    console.log("App listening on port 3005!");
  });