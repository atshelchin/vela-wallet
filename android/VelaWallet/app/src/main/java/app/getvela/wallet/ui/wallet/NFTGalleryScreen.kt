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
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.getvela.wallet.R
import app.getvela.wallet.model.WalletState
import app.getvela.wallet.service.ApiNft
import app.getvela.wallet.service.WalletApiService
import app.getvela.wallet.ui.components.VelaSecondaryButton
import app.getvela.wallet.ui.theme.*
import coil3.compose.SubcomposeAsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private enum class ViewMode { Collections, All }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NFTGalleryScreen(
    wallet: WalletState,
    onNftClick: (ApiNft) -> Unit = {},
    onAddCollection: () -> Unit = {},
    useMockData: Boolean = false,
) {
    var nfts by remember { mutableStateOf<List<ApiNft>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    var expandedCollection by remember { mutableStateOf<String?>(null) }
    var viewMode by remember { mutableStateOf(ViewMode.Collections) }
    var refreshTrigger by remember { mutableIntStateOf(0) }

    val collections by remember(nfts) {
        derivedStateOf {
            nfts.groupBy { it.collectionName ?: it.contractAddress }
                .map { (name, items) -> NFTCollection(name, items.first().contractAddress, items.first().chainName, items.first().collectionImage ?: items.first().image, items) }
                .sortedByDescending { it.items.size }
        }
    }

    LaunchedEffect(wallet.address, refreshTrigger) {
        if (useMockData) { nfts = mockNfts(); return@LaunchedEffect }
        if (wallet.address.isEmpty()) return@LaunchedEffect
        isLoading = nfts.isEmpty()
        nfts = withContext(Dispatchers.IO) { WalletApiService().fetchNFTs(wallet.address) }
        isLoading = false
        isRefreshing = false
    }

    Column(modifier = Modifier.fillMaxSize().background(VelaColor.bg).systemBarsPadding()) {
        // Header: title + view toggle + add button
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = VelaSpacing.screenH, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.tab_nfts), style = VelaTypography.title(17f), color = VelaColor.textPrimary)
            Spacer(Modifier.weight(1f))

            // View mode toggle
            Row(
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(VelaColor.bgWarm).padding(2.dp),
            ) {
                ViewModeButton(Icons.Default.ViewList, viewMode == ViewMode.Collections) { viewMode = ViewMode.Collections }
                ViewModeButton(Icons.Default.GridView, viewMode == ViewMode.All) { viewMode = ViewMode.All }
            }

            Spacer(Modifier.width(8.dp))

            // Add button
            Box(
                modifier = Modifier.size(32.dp).clip(RoundedCornerShape(8.dp)).background(VelaColor.accentSoft).clickable(onClick = onAddCollection),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.Add, null, Modifier.size(14.dp), tint = VelaColor.accent)
            }
        }

        // Stats bar
        if (nfts.isNotEmpty()) {
            Row(
                modifier = Modifier.padding(horizontal = VelaSpacing.screenH).padding(bottom = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                StatBadge("${collections.size}", stringResource(R.string.nft_stat_collections))
                StatBadge("${nfts.size}", stringResource(R.string.nft_stat_items))
            }
        }

        // Content
        when {
            isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(Modifier.size(24.dp), color = VelaColor.textTertiary, strokeWidth = 2.dp)
            }
            nfts.isEmpty() -> EmptyState(onAddCollection)
            else -> PullToRefreshBox(
                isRefreshing = isRefreshing,
                onRefresh = { isRefreshing = true; refreshTrigger++ },
            ) {
                when (viewMode) {
                    ViewMode.Collections -> CollectionsView(collections, expandedCollection, { expandedCollection = if (expandedCollection == it) null else it }, onNftClick)
                    ViewMode.All -> AllNFTsGrid(nfts, onNftClick)
                }
            }
        }
    }
}

// MARK: - View Mode Button

@Composable
private fun ViewModeButton(icon: androidx.compose.ui.graphics.vector.ImageVector, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier.size(28.dp).clip(RoundedCornerShape(6.dp))
            .background(if (selected) VelaColor.bgCard else Color.Transparent)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, Modifier.size(12.dp), tint = if (selected) VelaColor.textPrimary else VelaColor.textTertiary)
    }
}

// MARK: - Stat Badge

@Composable
private fun StatBadge(value: String, label: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(value, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = VelaColor.textPrimary)
        Text(label, fontSize = 12.sp, color = VelaColor.textTertiary)
    }
}

// MARK: - Empty State

@Composable
private fun ColumnScope.EmptyState(onAdd: () -> Unit) {
    Column(
        modifier = Modifier.weight(1f).padding(horizontal = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(Modifier.size(80.dp).background(VelaColor.bgWarm, CircleShape), contentAlignment = Alignment.Center) {
            Text("🖼", fontSize = 36.sp)
        }
        Spacer(Modifier.height(20.dp))
        Text(stringResource(R.string.nft_empty_title), style = VelaTypography.heading(20f), color = VelaColor.textPrimary)
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.nft_empty_desc), style = VelaTypography.body(14f), color = VelaColor.textSecondary, textAlign = TextAlign.Center, lineHeight = 20.sp)
        Spacer(Modifier.height(20.dp))
        VelaSecondaryButton(text = stringResource(R.string.nft_add_collection_title), onClick = onAdd)
    }
}

// MARK: - Collections View

@Composable
private fun CollectionsView(collections: List<NFTCollection>, expanded: String?, onToggle: (String) -> Unit, onNftClick: (ApiNft) -> Unit) {
    LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items(collections, key = { it.contractAddress }) { collection ->
            CollectionCard(collection, expanded == collection.name, { onToggle(collection.name) }, onNftClick)
        }
    }
}

// MARK: - All NFTs Grid

@Composable
private fun AllNFTsGrid(nfts: List<ApiNft>, onNftClick: (ApiNft) -> Unit) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(nfts, key = { it.id }) { nft ->
            Column(
                modifier = Modifier.clip(RoundedCornerShape(VelaRadius.card)).background(VelaColor.bgCard)
                    .border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card)).clickable { onNftClick(nft) },
            ) {
                NFTImage(nft, Modifier.fillMaxWidth().height(160.dp))
                Column(Modifier.padding(10.dp)) {
                    Text(nft.displayName, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(3.dp))
                    Text(nft.collectionName ?: nft.chainName, fontSize = 11.sp, color = VelaColor.textTertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

// MARK: - Collection Card

@Composable
private fun CollectionCard(collection: NFTCollection, isExpanded: Boolean, onToggle: () -> Unit, onNftClick: (ApiNft) -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(VelaRadius.card))
            .background(VelaColor.bgCard).border(1.dp, VelaColor.border, RoundedCornerShape(VelaRadius.card)),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().clickable(onClick = onToggle).padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Collection icon 48dp
            CollectionIcon(collection, 48.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(collection.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = VelaColor.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(collection.chainName, fontSize = 12.sp, color = VelaColor.textTertiary)
                    Text("·", fontSize = 12.sp, color = VelaColor.textTertiary)
                    Text("${collection.items.size} items", fontSize = 12.sp, color = VelaColor.textTertiary)
                }
            }
            // Chevron in circle
            Box(Modifier.size(28.dp).background(VelaColor.bgWarm, CircleShape), contentAlignment = Alignment.Center) {
                Icon(if (isExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown, null, Modifier.size(16.dp), tint = VelaColor.textTertiary)
            }
        }

        AnimatedVisibility(visible = isExpanded) {
            Column {
                HorizontalDivider(color = VelaColor.border)
                val rows = collection.items.chunked(3)
                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    rows.forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEach { nft ->
                                NFTMiniCard(nft, { onNftClick(nft) }, Modifier.weight(1f))
                            }
                            repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CollectionIcon(collection: NFTCollection, size: androidx.compose.ui.unit.Dp) {
    if (collection.image != null) {
        val url = collection.image.let { if (it.startsWith("ipfs://")) "https://ipfs.io/ipfs/${it.removePrefix("ipfs://")}" else it }
        SubcomposeAsyncImage(model = url, contentDescription = collection.name, modifier = Modifier.size(size).clip(RoundedCornerShape(12.dp)), contentScale = ContentScale.Crop,
            error = { CollectionIconFallback(collection.name, size) }, loading = { CollectionIconFallback(collection.name, size) })
    } else CollectionIconFallback(collection.name, size)
}

@Composable
private fun CollectionIconFallback(name: String, size: androidx.compose.ui.unit.Dp) {
    Box(Modifier.size(size).background(VelaColor.bgWarm, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
        Text(name.take(2).uppercase(), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = VelaColor.textSecondary)
    }
}

@Composable
private fun NFTMiniCard(nft: ApiNft, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.clip(RoundedCornerShape(8.dp)).background(VelaColor.bg).border(1.dp, VelaColor.border, RoundedCornerShape(8.dp)).clickable(onClick = onClick)) {
        NFTImage(nft, Modifier.fillMaxWidth().aspectRatio(1f))
        Text(nft.displayName.substringAfter("#", nft.displayName).let { if (it != nft.displayName) "#$it" else it },
            fontSize = 10.sp, color = VelaColor.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp))
    }
}

@Composable
private fun NFTImage(nft: ApiNft, modifier: Modifier) {
    if (nft.imageUrl != null) {
        SubcomposeAsyncImage(model = nft.imageUrl, contentDescription = nft.displayName, modifier = modifier, contentScale = ContentScale.Crop,
            error = { Box(modifier.background(VelaColor.bgWarm), contentAlignment = Alignment.Center) { Text("🖼", fontSize = 16.sp) } },
            loading = { Box(modifier.background(VelaColor.bgWarm)) })
    } else Box(modifier.background(VelaColor.bgWarm), contentAlignment = Alignment.Center) { Text("🖼", fontSize = 16.sp) }
}

data class NFTCollection(val name: String, val contractAddress: String, val chainName: String, val image: String?, val items: List<ApiNft>)

// MARK: - Mock Data
private fun mockNfts(): List<ApiNft> = listOf(
    ApiNft("eth-mainnet","Ethereum","0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D","3749","Bored Ape #3749","BAYC #3749","https://i.seadn.io/gae/aCFMJqFr1tPflRMDKPKxLnW54PjBiigwRj3qNh2VhNKhXeJE2gg-KuGYJDmOWCdaOE-S59VNjEybhSD2Cj9XFA?w=500","ERC721","Bored Ape Yacht Club",null),
    ApiNft("eth-mainnet","Ethereum","0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D","8520","Bored Ape #8520","BAYC #8520","https://i.seadn.io/gcs/files/4c1ac53895ad7cf63874a1dd30d28def.png?w=500","ERC721","Bored Ape Yacht Club",null),
    ApiNft("eth-mainnet","Ethereum","0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D","1234","Bored Ape #1234","BAYC #1234","https://i.seadn.io/gcs/files/d1d3d48b9e72a7eddf7de00a1d3af88f.png?w=500","ERC721","Bored Ape Yacht Club",null),
    ApiNft("eth-mainnet","Ethereum","0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB","7804","CryptoPunk #7804","Punk #7804","https://i.seadn.io/gae/ZWEV3wEsBl5ETCfGKgt-Ql98W4bDpVwv0LJOmpOCIJ9pSZEH0OKIL5KrAXJIlz5BmBNjt3elDZ6LzfR3JfBGhJlcwgZyYaOC3cs?w=500","ERC721","CryptoPunks",null),
    ApiNft("eth-mainnet","Ethereum","0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB","3100","CryptoPunk #3100","Punk #3100","https://i.seadn.io/gcs/files/81b1247b14d9f69a0f76cf698a2e2106.png?w=500","ERC721","CryptoPunks",null),
    ApiNft("arb-mainnet","Arbitrum","0x912CE59144191C1D603F1d49E6F13b8e665F5695","142","Arbitrum Odyssey #142","Odyssey #142","https://i.seadn.io/gcs/files/b13b67cf6cbd36c8080f9f0e08e54f75.png?w=500","ERC721","Arbitrum Odyssey",null),
    ApiNft("base-mainnet","Base","0xd4307E0acD12CF46fD6cf93BC264f6D5Aa0a8D46","55","Base Day One #55","Base #55","https://i.seadn.io/gcs/files/b13b67cf6cbd36c8080f9f0e08e54f75.png?w=500","ERC721","Base, Pair Introduced",null),
)
