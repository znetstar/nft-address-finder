# NFT Address Finder

This project contains a function that can find a master NFT, and all of its prints, on the Solana blockchain,
using any associated address as input.

## Use

```javascript
    const { findNftAddresses } = require ('nft-address-finder');
    const resp = await findNftAddresses('6APj2qGFJx5NDHnP5XVKJbrgK5CyCe4HesCTpSDtztMi');
    console.log(resp);
```

## Build 

Build with `npm run build` test with `npm test`.
