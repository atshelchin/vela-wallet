package app.getvela.wallet.ui.wallet

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.service.ApiNft
import app.getvela.wallet.service.WalletApiService
import app.getvela.wallet.ui.theme.*
import coil3.compose.SubcomposeAsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * NFT collection-based gallery.
 * Groups NFTs by collection, shows collection cards, expands to show NFTs.
 */
@Composable
fun NFTGalleryScreen(
    wallet: WalletState,
    onNftClick: (ApiNft) -> Unit = {},
    onAddCollection: () -> Unit = {},
    useMockData: Boolean = false,
) {
    var nfts by remember { mutableStateOf<List<ApiNft>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var expandedCollection by remember { mutableStateOf<String?>(null) }

    val collections by remember(nfts) {
        derivedStateOf {
            nfts.groupBy { it.collectionName ?: it.contractAddress }
                .map { (name, items) ->
                    NFTCollection(
                        name = name,
                        contractAddress = items.first().contractAddress,
                        chainName = items.first().chainName,
                        image = items.first().collectionImage ?: items.first().image,
                        items = items,
                    )
                }
                .sortedByDescending { it.items.size }
        }
    }

    LaunchedEffect(wallet.address) {
        if (useMockData) { nfts = mockNfts(); return@LaunchedEffect }
        if (wallet.address.isEmpty()) return@LaunchedEffect
        isLoading = true
        nfts = withContext(Dispatchers.IO) { WalletApiService().fetchNFTs(wallet.address) }
        isLoading = false
    }

    Column(
        modifier = Modifier.fillMaxSize().background(VelaColor.bg).systemBarsPadding(),
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = VelaSpacing.screenH, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.tab_nfts), style = VelaTypography.title(17f), color = VelaColor.textPrimary)
            Spacer(Modifier.weight(1f))
            // Add collection button
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(VelaColor.accentSoft)
                    .clickable(onClick = onAddCollection)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(Icons.Default.Add, null, Modifier.size(12.dp), tint = VelaColor.accent)
                Text(stringResource(R.string.nft_add_collection), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.accent)
            }
        }

        when {
            isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(Modifier.size(24.dp), color = VelaColor.textTertiary, strokeWidth = 2.dp)
            }
            collections.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("🖼", fontSize = 40.sp)
                    Spacer(Modifier.height(16.dp))
                    Text(stringResource(R.string.home_no_nfts), style = VelaTypography.body(14f), color = VelaColor.textTertiary)
                }
            }
            else -> LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(collections, key = { it.contractAddress }) { collection ->
                    CollectionCard(
                        collection = collection,
                        isExpanded = expandedCollection == collection.name,
                        onToggle = {
                            expandedCollection = if (expandedCollection == collection.name) null else collection.name
                        },
                        onNftClick = onNftClick,
                    )
                }
            }
        }
    }
}

data class NFTCollection(
    val name: String,
    val contractAddress: String,
    val chainName: String,
    val image: String?,
    val items: List<ApiNft>,
)

@Composable
private fun CollectionCard(
    collection: NFTCollection,
    isExpanded: Boolean,
    onToggle: () -> Unit,
    onNftClick: (ApiNft) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(VelaRadius.card))
            .background(VelaColor.bgCard)
            .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card)),
    ) {
        // Collection header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onToggle)
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Collection icon
            if (collection.image != null) {
                SubcomposeAsyncImage(
                    model = collection.image.let {
                        if (it.startsWith("ipfs://")) "https://ipfs.io/ipfs/${it.removePrefix("ipfs://")}" else it
                    },
                    contentDescription = collection.name,
                    modifier = Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)),
                    contentScale = ContentScale.Crop,
                    error = { CollectionIconFallback(collection.name) },
                    loading = { CollectionIconFallback(collection.name) },
                )
            } else {
                CollectionIconFallback(collection.name)
            }

            Spacer(Modifier.width(12.dp))

            Column(Modifier.weight(1f)) {
                Text(collection.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(collection.chainName, fontSize = 12.sp, color = VelaColor.textTertiary)
                    Text("·", fontSize = 12.sp, color = VelaColor.textTertiary)
                    Text("${collection.items.size} items", fontSize = 12.sp, color = VelaColor.textTertiary)
                }
            }

            Icon(
                if (isExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                null, Modifier.size(20.dp), tint = VelaColor.textTertiary,
            )
        }

        // Expanded: show NFT grid
        AnimatedVisibility(visible = isExpanded) {
            Column {
                HorizontalDivider(color = VelaColor.border)
                // NFT items in 3-column grid
                val rows = collection.items.chunked(3)
                Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    rows.forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEach { nft ->
                                NFTMiniCard(
                                    nft = nft,
                                    onClick = { onNftClick(nft) },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            // Fill remaining slots
                            repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CollectionIconFallback(name: String) {
    Box(
        modifier = Modifier.size(44.dp).background(VelaColor.bgWarm, RoundedCornerShape(10.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Text(name.take(2).uppercase(), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = VelaColor.textSecondary)
    }
}

@Composable
private fun NFTMiniCard(nft: ApiNft, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(VelaColor.bg)
            .border(1.dp, VelaColor.border, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick),
    ) {
        if (nft.imageUrl != null) {
            SubcomposeAsyncImage(
                model = nft.imageUrl,
                contentDescription = nft.displayName,
                modifier = Modifier.fillMaxWidth().aspectRatio(1f),
                contentScale = ContentScale.Crop,
                error = { Box(Modifier.fillMaxWidth().aspectRatio(1f).background(VelaColor.bgWarm), contentAlignment = Alignment.Center) { Text("🖼", fontSize = 16.sp) } },
                loading = { Box(Modifier.fillMaxWidth().aspectRatio(1f).background(VelaColor.bgWarm)) },
            )
        } else {
            Box(Modifier.fillMaxWidth().aspectRatio(1f).background(VelaColor.bgWarm), contentAlignment = Alignment.Center) { Text("🖼", fontSize = 16.sp) }
        }
        Text(
            nft.displayName.substringAfter("#", nft.displayName).let { if (it != nft.displayName) "#$it" else it },
            fontSize = 10.sp, color = VelaColor.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
        )
    }
}

// MARK: - Mock Data

private fun mockNfts(): List<ApiNft> = listOf(
    // BAYC collection (3 items)
    ApiNft(network = "eth-mainnet", chainName = "Ethereum", contractAddress = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
        tokenId = "3749", name = "Bored Ape #3749", description = "BAYC member #3749",
        image = "https://i.seadn.io/gae/aCFMJqFr1tPflRMDKPKxLnW54PjBiigwRj3qNh2VhNKhXeJE2gg-KuGYJDmOWCdaOE-S59VNjEybhSD2Cj9XFA?w=500",
        tokenType = "ERC721", collectionName = "Bored Ape Yacht Club", collectionImage = null),
    ApiNft(network = "eth-mainnet", chainName = "Ethereum", contractAddress = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
        tokenId = "8520", name = "Bored Ape #8520", description = "BAYC member #8520",
        image = "https://i.seadn.io/gcs/files/4c1ac53895ad7cf63874a1dd30d28def.png?w=500",
        tokenType = "ERC721", collectionName = "Bored Ape Yacht Club", collectionImage = null),
    ApiNft(network = "eth-mainnet", chainName = "Ethereum", contractAddress = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
        tokenId = "1234", name = "Bored Ape #1234", description = "BAYC member #1234",
        image = "https://i.seadn.io/gcs/files/d1d3d48b9e72a7eddf7de00a1d3af88f.png?w=500",
        tokenType = "ERC721", collectionName = "Bored Ape Yacht Club", collectionImage = null),
    // CryptoPunks collection (2 items)
    ApiNft(network = "eth-mainnet", chainName = "Ethereum", contractAddress = "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB",
        tokenId = "7804", name = "CryptoPunk #7804", description = "One of 10,000 unique CryptoPunks.",
        image = "https://i.seadn.io/gae/ZWEV3wEsBl5ETCfGKgt-Ql98W4bDpVwv0LJOmpOCIJ9pSZEH0OKIL5KrAXJIlz5BmBNjt3elDZ6LzfR3JfBGhJlcwgZyYaOC3cs?w=500",
        tokenType = "ERC721", collectionName = "CryptoPunks", collectionImage = null),
    ApiNft(network = "eth-mainnet", chainName = "Ethereum", contractAddress = "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB",
        tokenId = "3100", name = "CryptoPunk #3100", description = "One of 10,000 unique CryptoPunks.",
        image = "https://i.seadn.io/gcs/files/81b1247b14d9f69a0f76cf698a2e2106.png?w=500",
        tokenType = "ERC721", collectionName = "CryptoPunks", collectionImage = null),
    // Arbitrum Odyssey (1 item)
    ApiNft(network = "arb-mainnet", chainName = "Arbitrum", contractAddress = "0x912CE59144191C1D603F1d49E6F13b8e665F5695",
        tokenId = "142", name = "Arbitrum Odyssey #142", description = "Commemorative NFT.",
        image = "https://i.seadn.io/gcs/files/b13b67cf6cbd36c8080f9f0e08e54f75.png?w=500",
        tokenType = "ERC721", collectionName = "Arbitrum Odyssey", collectionImage = null),
    // Base (1 item)
    ApiNft(network = "base-mainnet", chainName = "Base", contractAddress = "0xd4307E0acD12CF46fD6cf93BC264f6D5Aa0a8D46",
        tokenId = "55", name = "Base Day One #55", description = "Base launch commemorative.",
        image = "https://i.seadn.io/gcs/files/b13b67cf6cbd36c8080f9f0e08e54f75.png?w=500",
        tokenType = "ERC721", collectionName = "Base, Pair Introduced", collectionImage = null),
)
