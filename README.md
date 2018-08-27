# Peepin' : Peepeth peep parser

This command line program reads through the complete history of the peepeth contract and
has the possibility to process each peep's data.

Useful for re-organizing peepeth data or creating data slices.

# Usage (development)

## Prerequisites

- a running IPFS daemon on localhost (https://ipfs.io/docs/install/)
- an Ethereum node with websocket support ( run Parity / geth ) or use Infura (discouraged because centralized)

## Installation

```

npm install
node ./bin.js --ipfsapihost localhost --ipfsapiport 5001 --web3hostws wss://mainnet.infura.io/_ws

```

Currently the only thing that this does is iterate through all Peepeth events - and un it through the current version of parsers. The only thing that they do currently is copying the centralized aspects of Peepeth ( the avatar images and backgrounds ) to IFPS and create a tree of linked peeps on IPFS. A demo of the output is currently at https://peepfeed.netlify.com - but there is a lot more that we could do using this data..

# Architecture of the parsers

Each peep event is read from the smart contract in the `peepin.js` file. Each event first trigggers a download of the related IPFS data (The IPFS hash in the contract function) and then looks up if a parser exists for its type, and if so it passes all this data to the corresponding parser ( see `parsers/index.js` for the mapping of data-types -> parser.

The parser then does whatever he wants with the data. Currently the implemented parsers use a local 'leveldb' database to store some of its info for easiers lookups later.

If you want to help implement parsers, there's some info and ideas in this `epic` https://github.com/sponnet/peepin/issues/2

# Analysis of the Peepeth functions

## User functions that change state with IPFS data

### updateAccount(_ipfsHash string)
Sample data:

```
{
    "info": "Peepeth creator.",
    "location": "California",
    "realName": "Bevan Barton",
    "website": "https://peepeth.com",
    "avatarUrl": "peepeth:bECcUGZh:jpg",
    "backgroundUrl": "peepeth:vbbfAvi2:jpg",
    "messageToWorld": "Do the right thing.",
    "untrustedTimestamp": 1521080303
}
```

### reply(_ipfsHash string)
Sample:

```
{
    "type": "peep",
    "content": "Yes. Yesssss. ",
    "pic": "",
    "untrustedAddress": "0x94b26d7a0145635ed3dad4b786f47b6be4f3945a",
    "untrustedTimestamp": 1521521622,
    "shareID": null,
    "parentID": "Qmf4TMhyrqhRH8YtwdnzvrPU28pYVGtDTiix6zVzh8kKY2"
}
```



### share(_ipfsHash string)

Sample data:

```
{
    "type": "peep",
    "content": "Yay mobile!!\n\nThe great news is we have @pete from #Cipher @sid from #Toshi and @vikmeup from #Trust (I like to shout about mobile)\n\nBetween those three we can get a great mobile experience. ",
    "pic": "",
    "untrustedAddress": "0x13ebd3443fa5575f0eb173e323d8419f7452cfb1",
    "untrustedTimestamp": 1521775536,
    "shareID": "QmREFpaf53MLW1C3MyHxgmbVdUxS5VjKHjeP2hPuhEjwbg",
    "parentID": null
}
```

### saveBatch(_ipfsHash string)

Sample data:

```
 {
    "batchSaveJSON": [
      {
        "peep": {
          "ipfs": "QmaZvkhSyb9DBwWjKPwMAACyQRAAGVUm2mPc8sPb1B4v5Y",
          "untrustedTimestamp": 1521247003
        }
      }
    ],
    "untrustedTimestamp": 1521247022
}
```

### post(_ipfsHash string)

Sample data:

```
{
    "type": "peep",
    "content": "...and Peepeth is live! Thanks to all who helped.\n\nShare what matters, reward the truth, and have fun!",
    "pic": "",
    "untrustedAddress": "0x30755d3e65c0cf46c35b72d11e52d941c5fc3a3e",
    "untrustedTimestamp": 1521135122,
    "shareID": null,
    "parentID": null
}
```

### createAccount(_name bytes16,_ipfsHash string)

Sample data:

```
{
    "info": "Peepeth creator.",
    "location": "California",
    "realName": "Bevan Barton",
    "website": "https://peepeth.com",
    "avatarUrl": "peepeth:bECcUGZh:jpg",
    "backgroundUrl": "peepeth:vbbfAvi2:jpg",
    "messageToWorld": "Do the right thing.",
    "untrustedTimestamp": 1521080303
}
```

### tip(_author address,_messageID string,_ownerTip uint256,_ipfsHash string)

Sample data:

```
{
    "type": "tip",
    "content": "Great job Bevan!",
    "parentID": "QmQfeQuPE3sxeCSrmHMLXxUZysRkA7YsodLYkPkrYXw9CU",
    "shareID": null,
    "untrustedAddress": "0x788d7dcc3c5a23ab08b343e25d76e0cd3174761c",
    "untrustedTimestamp": 1521156236
}
```


## User functions the change state without IPFS data

```
unFollow(_followee address)
setIsActive(_isActive bool)
follow(_followee address)
changeName(_name bytes16)
setNewAddress(_address address)
newAddress()
transferAccount(_address address)
```

## User functions that don't change state

```
isActive()
names( address)
addresses( bytes32)
owner()
accountExists(_addr address)
isValidName(bStr bytes16)
tipPercentageLocked()
```

## Admin functions

```
cashout()
setMinSiteTipPercentage(newMinPercentage uint256)
interfaceInstances( uint256)
lockMinSiteTipPercentage()
interfaceInstanceCount()
minSiteTipPercentage()
transferOwnership(newOwner address)
```

# How can you help ?

Currently we need more insights in the data format and improve the parsers. So if you want to take a look at the issues, please install the ZenHub plugin for your browser (https://www.zenhub.com/) and head over to the board. https://github.com/sponnet/peepin#boards



